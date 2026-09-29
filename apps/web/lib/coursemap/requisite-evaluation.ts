import {
  collegeEnrolmentStatus,
  type ProgrammeCollege,
} from "../academic/college-enrolment.ts";
import {
  validEnrolmentMode,
  type EnrolmentMode,
  enrolmentModeLabel,
} from "../academic/enrolment-mode.ts";
import {
  validCommencementYear,
  validCommencementYearBounds,
} from "../academic/commencement-year.ts";
import {
  gradePointAverage,
  minimumMarkStatus,
  weightedAverageMark,
} from "@/lib/academic/metrics";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { CompletedRequisiteCourse } from "@/lib/coursemap/requisite-summary";
import type { CourseRuleCondition } from "@/lib/coursemap/requisite-tree";
import type { Attempt } from "@/lib/coursemap/types";

/**
 * What a student has done, in the terms a requisite rule asks about. Every
 * field a rule cannot be judged without is nullable, so a missing record reads
 * as "not known" rather than as a failure.
 */
export type StudentRecord = {
  completed: ReadonlyMap<
    string,
    {
      units: number;
      mark: number | null;
      resultCode?: string;
      tags?: readonly string[];
    }
  >;
  /** Courses taken this semester, which satisfy a concurrent requisite. */
  enrolled: ReadonlySet<string>;
  programmeCodes: readonly string[];
  programmeColleges?: readonly ProgrammeCollege[];
  wam: number | null;
  gpa: number | null;
  studyYear: number | null;
  commencementYear?: number | null;
  enrolmentMode?: EnrolmentMode | null;
  /** Approval recorded for this course attempt, when checking a plan. */
  permissionApproved?: boolean;
};

export type RequisiteStatus = "met" | "partial" | "unmet" | "unknown";

export type RequisiteMeasure =
  | { kind: "units"; value: number; target: number }
  | { kind: "score"; value: number; threshold: number; scale: "wam" | "gpa" }
  | { kind: "count"; value: number; target: number };

export type ConditionEvaluation = {
  status: RequisiteStatus;
  measure?: RequisiteMeasure;
  /** One line about the student's side of the condition. */
  detail?: string;
};

const COURSE_CODE = /^([A-Z]{4})(\d)\d{3}[A-Z]?$/u;

function courseLevel(code: string) {
  const match = COURSE_CODE.exec(code);
  return match ? Number(match[2]) * 1000 : null;
}

function subjectOf(code: string) {
  return COURSE_CODE.exec(code)?.[1] ?? null;
}

function unitsWhere(
  student: StudentRecord,
  include: (code: string, tags: readonly string[]) => boolean,
) {
  let units = 0;
  for (const [code, result] of student.completed) {
    if (include(code, result.tags ?? [])) units += result.units;
  }
  return units;
}

function unitsStatus(value: number, target: number): RequisiteStatus {
  if (value >= target) return "met";
  return value > 0 ? "partial" : "unmet";
}

function unitsEvaluation(value: number, target: number): ConditionEvaluation {
  return {
    status: unitsStatus(value, target),
    measure: { kind: "units", value, target },
  };
}

function scoreEvaluation(
  value: number | null,
  threshold: number,
  scale: "wam" | "gpa",
): ConditionEvaluation {
  if (value === null) return { status: "unknown" };
  return {
    status: value >= threshold ? "met" : "unmet",
    measure: { kind: "score", value, threshold, scale },
  };
}

/**
 * One condition against one student. Conditions the record cannot answer,
 * such as a permission or a tag the catalogue does not carry, stay unknown.
 */
export function evaluateCondition(
  condition: CourseRuleCondition,
  student: StudentRecord,
): ConditionEvaluation {
  switch (condition.kind) {
    case "course": {
      const result = student.completed.get(condition.code);
      if (result) {
        if (condition.minimumMark === null) return { status: "met" };
        if (result.mark === null)
          return {
            status: minimumMarkStatus(result, condition.minimumMark),
            detail: result.resultCode
              ? `Your recorded grade is ${result.resultCode}`
              : "Your mark is not recorded",
          };
        return {
          status: result.mark >= condition.minimumMark ? "met" : "unmet",
          detail: `You got ${result.mark} in ${condition.code}`,
        };
      }
      if (
        condition.requirementMode === "completed_or_concurrent" &&
        student.enrolled.has(condition.code)
      ) {
        if (condition.minimumMark !== null) {
          return {
            status: "unknown",
            detail: "Your required mark is not yet recorded",
          };
        }
        return {
          status: "met",
          detail: "Enrolled this semester, which counts for this course",
        };
      }
      return { status: "unmet" };
    }
    case "incompatible_concurrent":
      return student.enrolled.has(condition.code)
        ? { status: "unmet", detail: `You are enrolled in ${condition.code}` }
        : { status: "met", detail: `You aren't enrolled in ${condition.code}` };
    case "incompatible":
      return student.completed.has(condition.code)
        ? {
            status: "unmet",
            detail: `You have completed ${condition.code}`,
          }
        : {
            status: "met",
            detail: `You haven't completed ${condition.code}`,
          };
    case "units_total":
      return unitsEvaluation(
        unitsWhere(student, () => true),
        condition.units,
      );
    case "subject_units":
      return condition.subject
        ? unitsEvaluation(
            unitsWhere(
              student,
              (code) => subjectOf(code) === condition.subject,
            ),
            condition.units,
          )
        : { status: "unknown" };
    case "subject_courses": {
      const count = [...student.completed.keys()].filter(
        (code) => subjectOf(code) === condition.subject,
      ).length;
      return {
        status: unitsStatus(count, condition.minimumCount),
        measure: {
          kind: "count",
          value: count,
          target: condition.minimumCount,
        },
      };
    }
    case "level_units":
      return unitsEvaluation(
        unitsWhere(student, (code) => {
          const level = courseLevel(code);
          if (level === null || level < condition.minimumLevel) return false;
          if (condition.maximumLevel !== null && level > condition.maximumLevel)
            return false;
          return !condition.subject || subjectOf(code) === condition.subject;
        }),
        condition.units,
      );
    case "course_set_units":
      return unitsEvaluation(
        unitsWhere(student, (code) => condition.courseCodes.includes(code)),
        condition.units,
      );
    case "college_enrolment": {
      const status = collegeEnrolmentStatus(
        condition.college,
        student.programmeCodes,
        student.programmeColleges,
      );
      return {
        status,
        detail:
          status === "met"
            ? `Your programme is offered by ${condition.college}`
            : status === "unmet"
              ? "Your programme is offered by a different college"
              : "Programme college information is missing or conflicting.",
      };
    }
    case "enrolment_mode": {
      const mode = student.enrolmentMode;
      if (!validEnrolmentMode(mode)) return { status: "unknown" };
      return {
        status:
          (mode === condition.enrolmentMode) === condition.matchesEnrolmentMode
            ? "met"
            : "unmet",
        detail: `Your enrolment is a ${enrolmentModeLabel(mode)}`,
      };
    }
    case "commencement_year": {
      const year = student.commencementYear;
      if (
        !validCommencementYear(year) ||
        !validCommencementYearBounds(condition)
      )
        return { status: "unknown" };
      return {
        status:
          (condition.minimumCommencementYear === null ||
            year >= condition.minimumCommencementYear) &&
          (condition.maximumCommencementYear === null ||
            year <= condition.maximumCommencementYear)
            ? "met"
            : "unmet",
        detail: `You commenced in ${year}`,
      };
    }
    case "year_standing":
      if (student.studyYear === null) return { status: "unknown" };
      return {
        status: student.studyYear >= condition.minimumYear ? "met" : "unmet",
        detail: `You're in year ${student.studyYear}`,
      };
    case "structure":
      if (!condition.structureCode) return { status: "unknown" };
      return student.programmeCodes.includes(condition.structureCode)
        ? {
            status: "met",
            detail: `You're enrolled in ${condition.structureCode}`,
          }
        : { status: "unmet" };
    case "structure_set": {
      const matched = condition.structureCodes.filter((code) =>
        student.programmeCodes.includes(code),
      ).length;
      const needed = condition.minimumCount ?? 1;
      return { status: matched >= needed ? "met" : "unmet" };
    }
    case "wam":
      return scoreEvaluation(student.wam, condition.minimumWam, "wam");
    case "gpa":
      return scoreEvaluation(student.gpa, condition.minimumGpa, "gpa");
    case "tagged_units": {
      // A tag is one category however it is capitalised.
      const wanted = condition.tag.toLowerCase();
      return unitsEvaluation(
        unitsWhere(student, (_code, tags) =>
          tags.some((tag) => tag.toLowerCase() === wanted),
        ),
        condition.units,
      );
    }
    case "permission":
      return {
        status:
          student.permissionApproved === undefined
            ? "unknown"
            : student.permissionApproved
              ? "met"
              : "unmet",
      };
    case "elective_units":
    case "other":
      return { status: "unknown" };
  }
}

type Group = Extract<CourseRuleExpression, { kind: "group" }>;

export function groupRequiredCount(group: Group) {
  if (group.operator === "all_of") return group.conditions.length;
  if (group.operator === "any_of") return 1;
  return group.minimumCount ?? 1;
}

/** A rule or sub-rule against one student, with its children's results. */
export function evaluateRule(
  expression: CourseRuleExpression,
  student: StudentRecord,
): ConditionEvaluation {
  if (expression.kind !== "group")
    return evaluateCondition(expression, student);
  const results = expression.conditions.map((child) =>
    evaluateRule(child, student),
  );
  const met = results.filter((result) => result.status === "met").length;
  const needed = groupRequiredCount(expression);
  const measure: RequisiteMeasure = {
    kind: "count",
    value: Math.min(met, needed),
    target: needed,
  };
  if (met >= needed) return { status: "met", measure };
  const unknown = results.filter(
    (result) => result.status === "unknown",
  ).length;
  if (met + unknown >= needed) return { status: "unknown" };
  const started = results.some(
    (result) => result.status === "met" || result.status === "partial",
  );
  return { status: started ? "partial" : "unmet", measure };
}

/**
 * The reader's record in the terms a requisite asks about. Completion comes
 * from the server snapshot, which only counts finished attempts; marks and
 * this semester's enrolments come from the plan.
 */
export function studentRecord({
  attempts,
  commencementYear,
  completedCourses,
  enrolmentMode,
  programmeCodes,
  programmeColleges,
}: {
  attempts: readonly Attempt[];
  commencementYear: number | null;
  enrolmentMode?: EnrolmentMode | null;
  completedCourses: readonly CompletedRequisiteCourse[];
  programmeCodes: readonly string[];
  programmeColleges?: readonly ProgrammeCollege[];
}): StudentRecord {
  const finished = attempts.filter((attempt) => attempt.status === "completed");
  const markByCode = new Map(
    finished.flatMap((attempt) =>
      attempt.mark === undefined
        ? []
        : [[attempt.courseCode, attempt.mark] as const],
    ),
  );
  const gradeByCode = new Map(
    finished.flatMap((attempt) =>
      attempt.resultCode === undefined
        ? []
        : [[attempt.courseCode, attempt.resultCode] as const],
    ),
  );
  const completed = new Map(
    completedCourses.map((course) => [
      course.code.toUpperCase(),
      {
        units: course.units,
        mark: markByCode.get(course.code.toUpperCase()) ?? null,
        ...(gradeByCode.has(course.code.toUpperCase())
          ? { resultCode: gradeByCode.get(course.code.toUpperCase()) }
          : {}),
        tags: course.tags ?? [],
      },
    ]),
  );
  const results = finished.map((attempt) => ({
    mark: attempt.mark,
    resultCode: attempt.resultCode,
    units:
      attempt.unitsEarned ??
      attempt.unitsAttempted ??
      completed.get(attempt.courseCode)?.units ??
      0,
  }));
  return {
    completed,
    enrolled: new Set(
      attempts
        .filter((attempt) => attempt.status === "enrolled")
        .map((attempt) => attempt.courseCode),
    ),
    commencementYear,
    enrolmentMode,
    programmeCodes: programmeCodes.map((code) => code.toUpperCase()),
    programmeColleges,
    wam: weightedAverageMark(results),
    gpa: gradePointAverage(results),
    studyYear: commencementYear
      ? Math.max(1, new Date().getFullYear() - commencementYear + 1)
      : null,
  };
}
