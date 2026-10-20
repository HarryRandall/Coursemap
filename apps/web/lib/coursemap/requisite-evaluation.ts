import { TD_TAG, type TdUnits } from "./td-designation";
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
  careerEnrolmentStatus,
  programmeCareerLabel,
  type ProgrammeCareerRecord,
} from "../academic/programme-career.ts";
import { catalogueKindForCode } from "../catalogue/record-reference.ts";
import { minimumMarkStatus } from "@/lib/academic/metrics";
import {
  academicResultUnits,
  isRecordedAcademicAttempt,
  recentGradedAverage,
  recordedGradePointAverage,
  recordedWeightedAverageMark,
  type DatedAcademicResult,
} from "@/lib/academic/attempt-results";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { CompletedRequisiteCourse } from "@/lib/coursemap/requisite-summary";
import type { CourseRuleCondition } from "@/lib/coursemap/requisite-tree";
import type { Attempt } from "@/lib/coursemap/types";
import {
  courseLevelForCode,
  courseMatchesFilter,
  courseSubjectForCode,
  type CourseFilter,
} from "@/lib/academic/course-code";

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
      tdUnits?: TdUnits;
    }
  >;
  /** Courses taken this semester, which satisfy a concurrent requisite. */
  enrolled: ReadonlySet<string>;
  /** Units of this semester's courses, where the plan records them. */
  enrolledUnits?: ReadonlyMap<string, number>;
  programmeCodes: readonly string[];
  programmeColleges?: readonly ProgrammeCollege[];
  programmeCareers?: readonly ProgrammeCareerRecord[];
  /**
   * Majors, minors and specialisations on the student's plan. Undefined when
   * the caller does not know them, so a structure rule stays unknown.
   */
  structureCodes?: readonly string[];
  wam: number | null;
  gpa: number | null;
  academicResults?: readonly DatedAcademicResult[];
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

/** Completed courses, then this semester's, that pass a subject and level filter. */
function matchingCourses(
  student: StudentRecord,
  filter: CourseFilter,
  includeConcurrent: boolean,
) {
  const completed = [...student.completed.keys()].filter((code) =>
    courseMatchesFilter(code, filter),
  );
  const enrolled = includeConcurrent
    ? [...student.enrolled].filter(
        (code) =>
          !student.completed.has(code) && courseMatchesFilter(code, filter),
      )
    : [];
  return { completed, enrolled };
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

type AverageCondition = Extract<CourseRuleCondition, { kind: "gpa" | "wam" }>;

function hasAverageScope(condition: AverageCondition) {
  return Boolean(
    condition.subjects?.length ||
    condition.courseCodes?.length ||
    condition.scopeText?.trim(),
  );
}

/**
 * The average over the courses a scoped condition names. Null when the scope
 * is printed without codes, or when a result's course is not recorded.
 */
function scopedAverage(
  student: StudentRecord,
  condition: AverageCondition,
  scale: "gpa" | "wam",
): number | null {
  const subjects = condition.subjects ?? [];
  const codes = condition.courseCodes ?? [];
  if (!subjects.length && !codes.length) return null;
  const results = student.academicResults ?? [];
  if (results.some((result) => !result.courseCode)) return null;
  const inScope = results.filter(
    (result) =>
      codes.includes(result.courseCode!) ||
      subjects.includes(courseSubjectForCode(result.courseCode!) ?? ""),
  );
  if (!inScope.length) return null;
  return scale === "gpa"
    ? recordedGradePointAverage(inScope)
    : recordedWeightedAverageMark(inScope);
}

/** The digits of a course code, which order courses within a subject's sequence. */
function courseSequenceNumber(code: string) {
  const digits = /^[A-Z]{4}(\d{4})[A-Z]?$/u.exec(code)?.[1];
  return digits === undefined ? null : Number(digits);
}

/**
 * Whether an expression is a soft requirement: an advisory condition, or a
 * group whose every condition is advisory. Soft requirements are shown to
 * students but never block enrolment or a plan.
 */
export function isSoftExpression(expression: CourseRuleExpression): boolean {
  if (expression.kind === "group")
    return (
      expression.conditions.length > 0 &&
      expression.conditions.every(isSoftExpression)
    );
  // A labelled note, even a required one, can't be checked, so it never
  // blocks whatever hardness an edit left on it.
  if (expression.kind === "other" && expression.noteKind) return true;
  return expression.hardness === "advisory";
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
              (code) => courseSubjectForCode(code) === condition.subject,
            ),
            condition.units,
          )
        : { status: "unknown" };
    case "subject_courses": {
      const count = [...student.completed.keys()].filter(
        (code) => courseSubjectForCode(code) === condition.subject,
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
    case "course_count": {
      const { completed, enrolled } = matchingCourses(
        student,
        { subjectCodes: condition.subjects, courseLevels: condition.levels },
        condition.requirementMode === "completed_or_concurrent",
      );
      const count = completed.length + enrolled.length;
      return {
        status: unitsStatus(count, condition.minimumCount),
        measure: {
          kind: "count",
          value: count,
          target: condition.minimumCount,
        },
        ...(enrolled.length
          ? {
              detail: `Includes ${enrolled.length} ${enrolled.length === 1 ? "course" : "courses"} you're enrolled in this semester`,
            }
          : {}),
      };
    }
    case "filtered_units": {
      const { completed, enrolled } = matchingCourses(
        student,
        { subjectCodes: condition.subjects, courseLevels: condition.levels },
        condition.requirementMode === "completed_or_concurrent",
      );
      let units = completed.reduce(
        (total, code) => total + (student.completed.get(code)?.units ?? 0),
        0,
      );
      let hasUnknownUnits = false;
      for (const code of enrolled) {
        const enrolledUnits = student.enrolledUnits?.get(code);
        if (enrolledUnits === undefined) hasUnknownUnits = true;
        else units += enrolledUnits;
      }
      if (units < condition.units && hasUnknownUnits)
        return {
          status: "unknown",
          detail: "The units of a course you're enrolled in are not recorded.",
        };
      return unitsEvaluation(units, condition.units);
    }
    case "career": {
      const status = careerEnrolmentStatus(
        condition.career,
        condition.matchesCareer,
        student.programmeCodes,
        student.programmeCareers,
      );
      return status === "unknown"
        ? {
            status,
            detail: "Your program's academic career is not recorded.",
          }
        : {
            status,
            detail:
              (status === "met") === condition.matchesCareer
                ? `You're enrolled in ${programmeCareerLabel(condition.career)}`
                : `You aren't enrolled in ${programmeCareerLabel(condition.career)}`,
          };
    }
    case "level_units":
      return unitsEvaluation(
        unitsWhere(student, (code) => {
          const level = courseLevelForCode(code);
          if (level === null || level < condition.minimumLevel) return false;
          if (condition.maximumLevel !== null && level > condition.maximumLevel)
            return false;
          return (
            !condition.subject ||
            courseSubjectForCode(code) === condition.subject
          );
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
    case "structure": {
      if (condition.matchesStructure === false) {
        // "Not enrolled in" is the opposite of enrolment; unknown stays unknown.
        const enrolled = evaluateCondition(
          { ...condition, matchesStructure: true },
          student,
        );
        if (enrolled.status === "unknown") return enrolled;
        return enrolled.status === "met"
          ? { status: "unmet", detail: enrolled.detail }
          : {
              status: "met",
              detail: `You're not enrolled in ${condition.structureCode}`,
            };
      }
      if (!condition.structureCode) return { status: "unknown" };
      if (catalogueKindForCode(condition.structureCode) !== "programme") {
        if (!student.structureCodes) return { status: "unknown" };
        return student.structureCodes.includes(condition.structureCode)
          ? {
              status: "met",
              detail: `Your plan includes ${condition.structureCode}`,
            }
          : { status: "unmet" };
      }
      return student.programmeCodes.includes(condition.structureCode)
        ? {
            status: "met",
            detail: `You're enrolled in ${condition.structureCode}`,
          }
        : { status: "unmet" };
    }
    case "structure_set": {
      const matched = condition.structureCodes.filter((code) =>
        student.programmeCodes.includes(code),
      ).length;
      const needed = condition.minimumCount ?? 1;
      return { status: matched >= needed ? "met" : "unmet" };
    }
    case "field_units":
      return {
        status: "unknown",
        detail: "Coursemap can't tell which of your courses are in this field.",
      };
    case "subject_sequence": {
      const position = courseSequenceNumber(condition.code);
      const later = [...student.completed.keys()].filter(
        (code) =>
          code !== condition.code &&
          courseSubjectForCode(code) === condition.subject &&
          position !== null &&
          (courseSequenceNumber(code) ?? -1) > position,
      );
      if (position === null) return { status: "unknown" };
      return later.length
        ? {
            status: "unmet",
            detail: `You've completed ${later.sort().join(", ")}, later in the ${condition.subject} sequence`,
          }
        : {
            status: "met",
            detail: `You haven't completed a later ${condition.subject} course`,
          };
    }
    case "wam":
      if (hasAverageScope(condition))
        return scoreEvaluation(
          scopedAverage(student, condition, "wam"),
          condition.minimumWam,
          "wam",
        );
      return scoreEvaluation(
        condition.recentGradedUnits
          ? recentGradedAverage(
              student.academicResults ?? [],
              condition.recentGradedUnits,
              "wam",
            )
          : student.wam,
        condition.minimumWam,
        "wam",
      );
    case "gpa":
      if (hasAverageScope(condition))
        return scoreEvaluation(
          scopedAverage(student, condition, "gpa"),
          condition.minimumGpa,
          "gpa",
        );
      return scoreEvaluation(
        condition.recentGradedUnits
          ? recentGradedAverage(
              student.academicResults ?? [],
              condition.recentGradedUnits,
              "gpa",
            )
          : student.gpa,
        condition.minimumGpa,
        "gpa",
      );
    case "tagged_units": {
      // A tag is one category however it is capitalised.
      const wanted = condition.tag.toLowerCase();
      if (wanted === TD_TAG.toLowerCase()) {
        let confirmed = 0;
        let unknown = 0;
        for (const result of student.completed.values()) {
          const fallback = result.tags?.some(
            (tag) => tag.toLowerCase() === wanted,
          )
            ? result.units
            : 0;
          confirmed += result.tdUnits?.confirmed ?? fallback;
          unknown += result.tdUnits?.unknown ?? 0;
        }
        if (
          confirmed < condition.units &&
          confirmed + unknown >= condition.units
        )
          return {
            status: "unknown",
            measure: {
              kind: "units",
              value: confirmed,
              target: condition.units,
            },
            detail:
              "Review the transdisciplinary designation for the year of completed study.",
          };
        return unitsEvaluation(confirmed, condition.units);
      }
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

function onlyIncompatibleConditions(expression: CourseRuleExpression): boolean {
  if (expression.kind === "group")
    return (
      expression.conditions.length > 0 &&
      expression.conditions.every(onlyIncompatibleConditions)
    );
  return (
    expression.kind === "incompatible" ||
    expression.kind === "incompatible_concurrent"
  );
}

/**
 * The operator a group is evaluated with. A group of nothing but exclusions
 * lists courses the student must avoid, so "incompatible with A or B" is
 * broken by either course whatever operator the source wording produced.
 * A group that mixes in another condition, such as a permission waiver,
 * keeps its operator.
 */
export function groupOperator(group: Group): Group["operator"] {
  return onlyIncompatibleConditions(group) ? "all_of" : group.operator;
}

export function groupRequiredCount(group: Group) {
  const operator = groupOperator(group);
  if (operator === "all_of") return group.conditions.length;
  if (operator === "any_of") return 1;
  return group.minimumCount ?? 1;
}

/** A rule or sub-rule against one student, with its children's results. */
export function evaluateRule(
  expression: CourseRuleExpression,
  student: StudentRecord,
): ConditionEvaluation {
  if (expression.kind !== "group")
    return evaluateCondition(expression, student);
  // Inside a group with hard conditions, a soft child never counts against
  // the student: required alongside others it is left out, and as an
  // alternative it reads as unknown unless the record shows it met.
  const isSoftGroup = isSoftExpression(expression);
  const operator = groupOperator(expression);
  const children = expression.conditions.map((child) => ({
    result: evaluateRule(child, student),
    isSoft: !isSoftGroup && isSoftExpression(child),
  }));
  const considered =
    operator === "all_of"
      ? children.filter((child) => !child.isSoft)
      : children;
  const results = considered.map(({ result, isSoft }) =>
    isSoft && result.status !== "met"
      ? ({ status: "unknown" } as ConditionEvaluation)
      : result,
  );
  const met = results.filter((result) => result.status === "met").length;
  const needed =
    operator === "all_of" ? results.length : groupRequiredCount(expression);
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
  programmeCareers,
  structureCodes,
}: {
  attempts: readonly Attempt[];
  commencementYear: number | null;
  enrolmentMode?: EnrolmentMode | null;
  completedCourses: readonly CompletedRequisiteCourse[];
  programmeCodes: readonly string[];
  programmeColleges?: readonly ProgrammeCollege[];
  programmeCareers?: readonly ProgrammeCareerRecord[];
  structureCodes?: readonly string[];
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
        tdUnits: course.tdUnits,
      },
    ]),
  );
  const results = attempts.filter(isRecordedAcademicAttempt).map((attempt) => ({
    courseCode: attempt.courseCode.toUpperCase(),
    mark: attempt.mark,
    resultCode: attempt.resultCode,
    periodStartsOn: attempt.periodStartsOn ?? null,
    units: academicResultUnits(
      attempt,
      attempt.status === "completed"
        ? completed.get(attempt.courseCode)?.units
        : undefined,
    ),
  }));
  return {
    completed,
    enrolled: new Set(
      attempts
        .filter((attempt) => attempt.status === "enrolled")
        .map((attempt) => attempt.courseCode),
    ),
    enrolledUnits: new Map(
      attempts.flatMap((attempt) =>
        attempt.status === "enrolled" && attempt.unitsAttempted !== undefined
          ? [[attempt.courseCode, attempt.unitsAttempted] as const]
          : [],
      ),
    ),
    commencementYear,
    enrolmentMode,
    programmeCodes: programmeCodes.map((code) => code.toUpperCase()),
    programmeColleges,
    ...(programmeCareers ? { programmeCareers } : {}),
    ...(structureCodes
      ? { structureCodes: structureCodes.map((code) => code.toUpperCase()) }
      : {}),
    academicResults: results,
    wam: recordedWeightedAverageMark(results),
    gpa: recordedGradePointAverage(results),
    studyYear: commencementYear
      ? Math.max(1, new Date().getFullYear() - commencementYear + 1)
      : null,
  };
}
