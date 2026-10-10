import { expect, test } from "vitest";
import { validCommencementYear } from "@/lib/academic/commencement-year";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  evaluateRule,
  studentRecord,
  type RequisiteStatus,
  type StudentRecord,
} from "@/lib/coursemap/requisite-evaluation";
import {
  sampleStudent,
  type SampleStudent,
} from "@/lib/coursemap/requisite-samples";
import type { Attempt, Course } from "@/lib/coursemap/types";
import {
  evaluateCoursePrerequisites,
  type PlanningCatalogue,
} from "@/lib/planner";
import { stat2001Requisites } from "./fixtures/stat2001-requisites";

// The planner judges a rule for a course in a planned term against the plan
// before that term. These cases describe the same student both ways, as a
// plan and as the record the course page evaluates, and expect one verdict.

const base = {
  confidence: 1,
  hardness: "hard" as const,
  reviewState: "verified" as const,
  sourceText: "",
};

const TARGET_YEAR = 2026;

const leaves: CourseRuleExpression[] = [
  {
    ...base,
    kind: "course",
    code: "COMP1100",
    minimumMark: null,
    requirementMode: "completed",
  },
  {
    ...base,
    kind: "course",
    code: "COMP1100",
    minimumMark: 65,
    requirementMode: "completed",
  },
  { ...base, kind: "incompatible", code: "COMP1130" },
  { ...base, kind: "incompatible_concurrent", code: "COMP1130" },
  { ...base, kind: "units_total", subject: null, units: 24 },
  { ...base, kind: "subject_units", subject: "MATH", units: 12 },
  {
    ...base,
    kind: "level_units",
    minimumLevel: 2000,
    maximumLevel: null,
    subject: "COMP",
    units: 12,
  },
  { ...base, kind: "subject_courses", subject: "STAT", minimumCount: 2 },
  {
    ...base,
    kind: "course_set_units",
    courseCodes: ["COMP2100", "COMP2120", "COMP2300"],
    units: 12,
  },
  { ...base, kind: "college_enrolment", college: "College of Science" },
  {
    ...base,
    kind: "enrolment_mode",
    enrolmentMode: "single_degree",
    matchesEnrolmentMode: true,
  },
  {
    ...base,
    kind: "commencement_year",
    minimumCommencementYear: 2024,
    maximumCommencementYear: null,
  },
  { ...base, kind: "year_standing", minimumYear: 2 },
  { ...base, kind: "structure", structureCode: "AACOM", text: null },
  {
    ...base,
    kind: "structure_set",
    minimumCount: 1,
    structureCodes: ["AACOM", "ASCAD"],
    structureKind: null,
  },
  { ...base, kind: "tagged_units", tag: "Science", units: 12 },
  { ...base, kind: "elective_units", units: 6 },
  { ...base, kind: "wam", minimumWam: 70 },
  { ...base, kind: "gpa", minimumGpa: 5 },
  { ...base, kind: "permission", text: "Permission of the convener" },
  { ...base, kind: "other", text: "Admission to honours" },
];

function verified(expression: CourseRuleExpression): CourseRuleExpression {
  return expression.kind === "group"
    ? { ...expression, conditions: expression.conditions.map(verified) }
    : { ...expression, hardness: "hard", reviewState: "verified" };
}

const groups: Array<[string, CourseRuleExpression]> = [
  [
    "at least a missing count of two courses",
    {
      kind: "group",
      operator: "at_least",
      minimumCount: null,
      conditions: [leaves[0], leaves[4]],
    },
  ],
  ["STAT2001 prerequisites", verified(stat2001Requisites)],
];

function course(code: string, units: number, tags: string[]): Course {
  return {
    code,
    name: code,
    year: TARGET_YEAR,
    units,
    level: Number(code.slice(4, 5)) * 1000,
    subject: code.slice(0, 4),
    school: "",
    convener: "",
    sessions: [],
    delivery: "",
    description: "",
    prerequisiteText: "",
    prerequisiteCodes: [],
    incompatibilities: [],
    countsTowards: [],
    tags,
    sourceUrl: "",
    lastChanged: "",
    parseState: "Verified",
    accent: "blue",
  };
}

/** The sample student as a plan: their record in the semester before. */
function planFor(rule: CourseRuleExpression, sample: SampleStudent) {
  const record = sampleStudent(rule, sample);
  const history: Attempt[] = [];
  const courses: Course[] = [];
  const complete = (
    code: string,
    units: number,
    mark: number | null,
    tags: readonly string[] = [],
  ) => {
    history.push({
      id: `history-${code}`,
      academicYear: TARGET_YEAR,
      courseCode: code,
      termId: `${TARGET_YEAR}-s1`,
      periodStartsOn: `${TARGET_YEAR}-02-23`,
      status: "completed",
      ...(mark === null ? {} : { mark }),
      unitsAttempted: units,
      unitsEarned: units,
    });
    courses.push(course(code, units, [...tags]));
  };
  for (const [code, result] of record.completed)
    complete(code, result.units, result.mark, result.tags);
  // Averages come from marks, so a sampled average becomes one result.
  if (record.wam !== null) complete("ZZWM1999", 6, record.wam);
  if (record.gpa !== null) complete("ZZGP1999", 6, 50 + record.gpa * 5);
  const commencementYear =
    record.commencementYear ?? TARGET_YEAR - record.studyYear! + 1;
  const target: Attempt = {
    id: "target",
    academicYear: TARGET_YEAR,
    courseCode: "ZZTG2000",
    termId: `${TARGET_YEAR}-s2`,
    status: "planned",
  };
  const catalogue: PlanningCatalogue = {
    courses: [
      ...courses,
      {
        ...course("ZZTG2000", 6, []),
        prerequisiteRule: {
          ...base,
          expression: null,
          relationalExpression: rule,
        },
      },
    ],
    terms: [
      {
        id: `${TARGET_YEAR}-s1`,
        year: TARGET_YEAR,
        name: "First Semester",
        shortName: "S1",
        dates: "",
      },
      {
        id: `${TARGET_YEAR}-s2`,
        year: TARGET_YEAR,
        name: "Second Semester",
        shortName: "S2",
        dates: "",
      },
    ],
    commencementYear,
    enrolmentMode: record.enrolmentMode ?? null,
    programmeCodes: record.programmeCodes,
    programmeColleges: record.programmeColleges,
  };
  const student: StudentRecord = {
    ...studentRecord({
      attempts: history,
      commencementYear,
      enrolmentMode: record.enrolmentMode ?? null,
      completedCourses: courses.map(({ code, units, tags }) => ({
        code,
        units,
        tags,
      })),
      programmeCodes: record.programmeCodes,
      programmeColleges: record.programmeColleges,
    }),
    // Standing is judged in the planned semester's year, not today's.
    studyYear: validCommencementYear(commencementYear)
      ? TARGET_YEAR - commencementYear + 1
      : null,
    permissionApproved: false,
  };
  return { attempts: [...history, target], catalogue, student, target };
}

const plannerStatus = {
  satisfied: "met",
  unsatisfied: "unmet",
  unknown: "unknown",
} as const;

function recordStatus(status: RequisiteStatus) {
  return status === "partial" ? "unmet" : status;
}

/**
 * The plan names only the programme, so a structure it does not list may
 * still be one the student is enrolled in. The planner asks for review.
 */
function plannerExpectation(
  rule: CourseRuleExpression,
  status: ReturnType<typeof recordStatus>,
) {
  return (rule.kind === "structure" || rule.kind === "structure_set") &&
    status === "unmet"
    ? "unknown"
    : status;
}

const cases: Array<[string, CourseRuleExpression]> = [
  ...leaves.map((leaf): [string, CourseRuleExpression] => [
    `${leaf.kind}${"minimumMark" in leaf && leaf.minimumMark ? " with a mark" : ""}`,
    leaf,
  ]),
  ...groups,
];

for (const [name, rule] of cases) {
  for (const sample of ["new", "partway", "complete"] as const) {
    test(`the planner and the course page agree on ${name} for a ${sample} student`, () => {
      const { attempts, catalogue, student, target } = planFor(rule, sample);
      const expected = plannerExpectation(
        rule,
        recordStatus(evaluateRule(rule, student).status),
      );
      expect(
        plannerStatus[
          evaluateCoursePrerequisites(target, attempts, catalogue).state
        ],
      ).toBe(expected);
    });
  }
}
