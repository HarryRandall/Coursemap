import type { ProgrammeCollege } from "@/lib/academic/college-enrolment";
import type { EnrolmentMode } from "@/lib/academic/enrolment-mode";
import { validCommencementYear } from "@/lib/academic/commencement-year";
import { minimumMarkStatus } from "@/lib/academic/metrics";
import type { Attempt, Course, Term } from "@/lib/coursemap/types";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  evaluateCondition,
  groupOperator,
  groupRequiredCount,
  studentRecord,
  type StudentRecord,
} from "@/lib/coursemap/requisite-evaluation";
import type { CourseRuleCondition } from "@/lib/coursemap/requisite-tree";

export type PlanningCatalogue = {
  courses: readonly Course[];
  snapshotCourses?: readonly Course[];
  terms: readonly Term[];
  commencementYear?: number | null;
  enrolmentMode?: EnrolmentMode | null;
  programmeCodes?: readonly string[];
  programmeColleges?: readonly ProgrammeCollege[];
};

export type EffectiveStatus =
  Attempt["status"] | "blocked" | "approval" | "review" | "unpublished";

export const STANDARD_COURSE_SLOTS = 4;
export const STANDARD_TERM_UNITS = 24;

export type PlanFixStep =
  | {
      type: "move";
      attemptId: string;
      courseCode: string;
      fromTermId: string;
      toTermId: string;
    }
  | {
      type: "add";
      academicYear: number;
      courseCode: string;
      termId: string;
    };

export type PlanFixResult =
  | { ok: true; steps: PlanFixStep[]; summary: string }
  | { ok: false; message: string };

export type DegreeUnitProgress = {
  completed: number;
  planned: number;
  remaining: number;
  mapped: number;
  total: number;
  percent: number;
};

function coursesFor(catalogue?: PlanningCatalogue) {
  return catalogue?.courses ?? [];
}

function termsFor(catalogue?: PlanningCatalogue) {
  return catalogue?.terms ?? [];
}

/** Returns undefined when the supplied code and year do not identify one course. */
export function planningCourseByCode(
  code: string,
  catalogue?: PlanningCatalogue,
  academicYear?: number,
) {
  const matches = coursesFor(catalogue).filter(
    (course) =>
      course.code === code &&
      (academicYear === undefined || course.year === academicYear),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * A pinned snapshot must resolve exactly; it never falls back to a newer course.
 * Unpinned attempts use their academic year, then the scheduled term's year.
 * A planned course that is no longer published resolves to nothing.
 */
export function planningCourseForAttempt(
  attempt: Attempt,
  catalogue?: PlanningCatalogue,
) {
  if (attempt.isPublished === false) return undefined;
  if (attempt.snapshotId !== undefined) {
    const matches = [
      ...coursesFor(catalogue),
      ...(catalogue?.snapshotCourses ?? []),
    ].filter(
      (course) =>
        course.snapshotId === attempt.snapshotId &&
        course.code === attempt.courseCode,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }
  const termYear = termsFor(catalogue).find(
    (term) => term.id === attempt.termId && term.id !== "unscheduled",
  )?.year;
  return planningCourseByCode(
    attempt.courseCode,
    catalogue,
    attempt.academicYear ?? termYear,
  );
}

export function unitsForAttempt(
  attempt: Attempt,
  course: Pick<Course, "units"> | undefined,
) {
  if (
    attempt.status === "completed" &&
    attempt.unitsEarned !== undefined &&
    Number.isFinite(attempt.unitsEarned)
  ) {
    return attempt.unitsEarned;
  }
  if (
    attempt.status !== "planned" &&
    attempt.unitsAttempted !== undefined &&
    Number.isFinite(attempt.unitsAttempted)
  ) {
    return attempt.unitsAttempted;
  }
  return course?.units ?? 0;
}

function orderOf(termId: string, catalogue?: PlanningCatalogue) {
  const availableTerms = termsFor(catalogue);
  const index = availableTerms.findIndex((term) => term.id === termId);
  return index >= 0 ? index : availableTerms.length;
}

export function termIndex(termId: string, catalogue?: PlanningCatalogue) {
  return orderOf(termId, catalogue);
}

export function isActiveAttempt(attempt: Attempt) {
  return attempt.status !== "failed" && attempt.status !== "withdrawn";
}

/**
 * Whether an attempt can satisfy or conflict with another course's rule. A
 * planned course that is no longer published cannot be taken, so it does
 * neither until the student replaces it.
 */
function countsTowardsRules(attempt: Attempt) {
  return isActiveAttempt(attempt) && attempt.isPublished !== false;
}

type PrerequisiteEvaluation = {
  missingCodes: string[];
  state: "satisfied" | "unsatisfied" | "unknown";
  permissionCanSatisfy?: boolean;
};

function prerequisiteAttempts(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue: PlanningCatalogue | undefined,
  allowConcurrent: boolean,
) {
  const targetOrder = orderOf(attempt.termId, catalogue);
  return attempts.filter(
    (candidate) =>
      candidate.id !== attempt.id &&
      countsTowardsRules(candidate) &&
      (allowConcurrent
        ? orderOf(candidate.termId, catalogue) <= targetOrder
        : orderOf(candidate.termId, catalogue) < targetOrder),
  );
}

function uniqueCodes(values: readonly string[]) {
  return [...new Set(values)].sort();
}

type PlannedRecord = {
  student: StudentRecord;
  /** The same record with every course of unknown units counted in full. */
  withUnknownUnits: StudentRecord | null;
};

/**
 * The student as the plan describes them when the attempt's term begins:
 * everything active in an earlier term counts as done, the same term counts as
 * concurrent, averages come from results recorded before it, and standing is
 * the term's year of study.
 */
function plannedStudentRecord(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
): PlannedRecord {
  const targetOrder = orderOf(attempt.termId, catalogue);
  const others = attempts.filter((candidate) => candidate.id !== attempt.id);
  const before = others.filter(
    (candidate) => orderOf(candidate.termId, catalogue) < targetOrder,
  );
  const done = new Map<
    string,
    { units: number; tags: string[]; isUnitsKnown: boolean }
  >();
  for (const candidate of before.filter(countsTowardsRules)) {
    const course = planningCourseForAttempt(candidate, catalogue);
    const units = unitsForAttempt(candidate, course);
    const previous = done.get(candidate.courseCode);
    // A course missing from the catalogue still has a subject and level in
    // its code. Only its units can be unknown.
    done.set(candidate.courseCode, {
      units: (previous?.units ?? 0) + units,
      tags: course?.tags ?? previous?.tags ?? [],
      isUnitsKnown: (previous?.isUnitsKnown ?? true) && (!!course || units > 0),
    });
  }
  const commencementYear = catalogue?.commencementYear ?? null;
  const term = termsFor(catalogue).find(
    (item) => item.id === attempt.termId && item.id !== "unscheduled",
  );
  const recordWith = (unknownUnits: number): StudentRecord => ({
    ...studentRecord({
      attempts: before,
      commencementYear,
      enrolmentMode: catalogue?.enrolmentMode,
      completedCourses: [...done].map(([code, course]) => ({
        code,
        units: course.isUnitsKnown ? course.units : unknownUnits,
        tags: course.tags,
      })),
      programmeCodes: catalogue?.programmeCodes ?? [],
      programmeColleges: catalogue?.programmeColleges,
    }),
    enrolled: new Set(
      others
        .filter(
          (candidate) =>
            countsTowardsRules(candidate) &&
            orderOf(candidate.termId, catalogue) === targetOrder,
        )
        .map((candidate) => candidate.courseCode),
    ),
    studyYear:
      term && validCommencementYear(commencementYear)
        ? Math.max(1, term.year - commencementYear + 1)
        : null,
    permissionApproved: attempt.permissionApproved ?? false,
  });
  const hasUnknownUnits = [...done.values()].some(
    (course) => !course.isUnitsKnown,
  );
  return {
    student: recordWith(0),
    withUnknownUnits: hasUnknownUnits
      ? recordWith(Number.MAX_SAFE_INTEGER)
      : null,
  };
}

/** A condition with no planner-specific meaning, judged as the course page does. */
function evaluatePlannedCondition(
  condition: CourseRuleCondition,
  record: PlannedRecord,
): PrerequisiteEvaluation {
  const result = evaluateCondition(condition, record.student);
  if (result.status === "met") return { state: "satisfied", missingCodes: [] };
  if (result.status === "unknown")
    return { state: "unknown", missingCodes: [] };
  // Units the catalogue cannot supply might reach the target.
  if (
    result.measure?.kind === "units" &&
    record.withUnknownUnits &&
    evaluateCondition(condition, record.withUnknownUnits).status === "met"
  )
    return { state: "unknown", missingCodes: [] };
  // The plan names only the programme, so a structure it does not list may
  // still be one the student is enrolled in.
  if (condition.kind === "structure" || condition.kind === "structure_set")
    return { state: "unknown", missingCodes: [] };
  return { state: "unsatisfied", missingCodes: [] };
}

function evaluateRelationalPrerequisite(
  expression: CourseRuleExpression,
  attempt: Attempt,
  attempts: Attempt[],
  catalogue: PlanningCatalogue | undefined,
  record: () => PlannedRecord,
): PrerequisiteEvaluation {
  if (expression.kind === "group") {
    const children = expression.conditions.map((condition) =>
      evaluateRelationalPrerequisite(
        condition,
        attempt,
        attempts,
        catalogue,
        record,
      ),
    );
    const operator = groupOperator(expression);
    if (operator === "all_of") {
      const unsatisfied = children.filter(
        (child) => child.state === "unsatisfied",
      );
      if (unsatisfied.length > 0) {
        if (
          children.some((child) => child.state === "unknown") &&
          unsatisfied.every((child) => child.permissionCanSatisfy)
        )
          return { state: "unknown", missingCodes: [] };
        return {
          state: "unsatisfied",
          missingCodes: uniqueCodes(
            children.flatMap((child) => child.missingCodes),
          ),
          permissionCanSatisfy: unsatisfied.every(
            (child) => child.permissionCanSatisfy,
          ),
        };
      }
      return children.some((child) => child.state === "unknown")
        ? { state: "unknown", missingCodes: [] }
        : { state: "satisfied", missingCodes: [] };
    }

    const required = groupRequiredCount(expression);
    const satisfied = children.filter(
      (child) => child.state === "satisfied",
    ).length;
    if (satisfied >= required) {
      return { state: "satisfied", missingCodes: [] };
    }
    const unknown = children.filter((child) => child.state === "unknown");
    if (satisfied + unknown.length >= required) {
      return { state: "unknown", missingCodes: [] };
    }
    const needed = required - satisfied;
    const permissionCanSatisfy =
      children.filter(
        (child) => child.state === "unsatisfied" && child.permissionCanSatisfy,
      ).length >= needed;
    const candidates = children
      .filter((child) => child.state === "unsatisfied")
      .toSorted(
        (left, right) => left.missingCodes.length - right.missingCodes.length,
      )
      .slice(0, needed);
    if (
      candidates.length !== needed ||
      candidates.some((candidate) => candidate.missingCodes.length === 0)
    ) {
      return {
        state: "unsatisfied",
        missingCodes: [],
        permissionCanSatisfy,
      };
    }
    return {
      state: "unsatisfied",
      missingCodes: uniqueCodes(
        candidates.flatMap((candidate) => candidate.missingCodes),
      ),
      permissionCanSatisfy,
    };
  }

  if (expression.hardness === "advisory") {
    return { state: "satisfied", missingCodes: [] };
  }
  if (expression.reviewState !== "verified") {
    return { state: "unknown", missingCodes: [] };
  }

  if (expression.kind === "course") {
    const eligible = prerequisiteAttempts(
      attempt,
      attempts,
      catalogue,
      expression.requirementMode === "completed_or_concurrent",
    ).filter((candidate) => candidate.courseCode === expression.code);
    if (expression.minimumMark !== null) {
      if (
        eligible.some(
          (candidate) =>
            candidate.status === "completed" &&
            minimumMarkStatus(candidate, expression.minimumMark!) === "met",
        )
      ) {
        return { state: "satisfied", missingCodes: [] };
      }
      return eligible.some(
        (candidate) =>
          candidate.status !== "completed" ||
          minimumMarkStatus(candidate, expression.minimumMark!) === "unknown",
      )
        ? { state: "unknown", missingCodes: [] }
        : { state: "unsatisfied", missingCodes: [expression.code] };
    }
    return eligible.length > 0
      ? { state: "satisfied", missingCodes: [] }
      : { state: "unsatisfied", missingCodes: [expression.code] };
  }

  if (expression.kind === "incompatible_concurrent") {
    const targetTerm = termsFor(catalogue).find(
      (term) => term.id === attempt.termId,
    );
    const candidates = attempts.filter(
      (candidate) =>
        candidate.id !== attempt.id &&
        candidate.courseCode === expression.code &&
        candidate.isPublished !== false &&
        (candidate.status === "planned" || candidate.status === "enrolled"),
    );
    let unknown = false;
    for (const candidate of candidates) {
      const otherTerm = termsFor(catalogue).find(
        (term) => term.id === candidate.termId,
      );
      if (
        !targetTerm ||
        !otherTerm ||
        attempt.termId === "unscheduled" ||
        candidate.termId === "unscheduled"
      ) {
        unknown = true;
        continue;
      }
      const overlaps =
        targetTerm.startsOn &&
        targetTerm.endsOn &&
        otherTerm.startsOn &&
        otherTerm.endsOn
          ? targetTerm.startsOn <= otherTerm.endsOn &&
            otherTerm.startsOn <= targetTerm.endsOn
          : candidate.termId === attempt.termId;
      if (overlaps) return { state: "unsatisfied", missingCodes: [] };
    }
    return { state: unknown ? "unknown" : "satisfied", missingCodes: [] };
  }
  if (expression.kind === "incompatible") {
    // A plan holding both courses breaks the exclusion whichever comes first,
    // so a planned or enrolled attempt in any term conflicts like a result.
    return attempts.some(
      (candidate) =>
        candidate.id !== attempt.id &&
        candidate.courseCode === expression.code &&
        countsTowardsRules(candidate),
    )
      ? { state: "unsatisfied", missingCodes: [] }
      : { state: "satisfied", missingCodes: [] };
  }

  if (expression.kind === "permission") {
    return attempt.permissionApproved
      ? { state: "satisfied", missingCodes: [] }
      : {
          state: "unsatisfied",
          missingCodes: [],
          permissionCanSatisfy: true,
        };
  }

  return evaluatePlannedCondition(expression, record());
}

/** Builds the planned record once, and only when a condition needs it. */
function lazyPlannedRecord(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
) {
  let record: PlannedRecord | undefined;
  return () => (record ??= plannedStudentRecord(attempt, attempts, catalogue));
}

export function evaluateCoursePrerequisites(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
): PrerequisiteEvaluation {
  const course = planningCourseForAttempt(attempt, catalogue);
  // Without the course its requisites cannot be read, so nothing is known.
  if (!course) return { state: "unknown", missingCodes: [] };
  if (course.prerequisiteRule === undefined) {
    const earlier = prerequisiteAttempts(attempt, attempts, catalogue, false);
    const missingCodes = course.prerequisiteCodes.filter(
      (code) => !earlier.some((candidate) => candidate.courseCode === code),
    );
    return missingCodes.length > 0
      ? { state: "unsatisfied", missingCodes }
      : { state: "satisfied", missingCodes: [] };
  }
  if (course.prerequisiteRule === null) {
    const text = course.prerequisiteText.trim().toLowerCase();
    const hasUnstructuredRule =
      course.prerequisiteCodes.length > 0 ||
      !["", "none", "no prerequisites listed."].includes(text);
    return hasUnstructuredRule
      ? { state: "unknown", missingCodes: [] }
      : { state: "satisfied", missingCodes: [] };
  }
  if (course.prerequisiteRule.hardness === "advisory") {
    return { state: "satisfied", missingCodes: [] };
  }
  if (
    course.prerequisiteRule.reviewState !== "verified" ||
    course.prerequisiteRule.relationalExpression === null
  ) {
    return { state: "unknown", missingCodes: [] };
  }
  return evaluateRelationalPrerequisite(
    course.prerequisiteRule.relationalExpression,
    attempt,
    attempts,
    catalogue,
    lazyPlannedRecord(attempt, attempts, catalogue),
  );
}

export function evaluateCourseIncompatibilities(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
): PrerequisiteEvaluation {
  const rule = planningCourseForAttempt(
    attempt,
    catalogue,
  )?.incompatibilityRule;
  if (!rule || rule.hardness === "advisory")
    return { state: "satisfied", missingCodes: [] };
  if (rule.reviewState !== "verified" || !rule.relationalExpression)
    return { state: "unknown", missingCodes: [] };
  return evaluateRelationalPrerequisite(
    rule.relationalExpression,
    attempt,
    attempts,
    catalogue,
    lazyPlannedRecord(attempt, attempts, catalogue),
  );
}

/**
 * Prerequisites that are NOT satisfied for this attempt.
 * Completed requirements must sit in an earlier term. A condition explicitly
 * marked completed-or-concurrent may also use the same term.
 */
export function missingPrereqs(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
): string[] {
  return evaluateCoursePrerequisites(attempt, attempts, catalogue).missingCodes;
}

export function effectiveStatus(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
): EffectiveStatus {
  if (attempt.status !== "planned") return attempt.status;
  if (attempt.isPublished === false) return "unpublished";
  const course = planningCourseForAttempt(attempt, catalogue);
  if (!course) return "review";
  const prerequisites = evaluateCoursePrerequisites(
    attempt,
    attempts,
    catalogue,
  );
  if (prerequisites.state === "unsatisfied") {
    return prerequisites.permissionCanSatisfy ? "approval" : "blocked";
  }
  if (prerequisites.state === "unknown") return "review";
  const incompatibilities = evaluateCourseIncompatibilities(
    attempt,
    attempts,
    catalogue,
  );
  if (incompatibilities.state === "unknown") return "review";
  if (incompatibilities.state === "unsatisfied")
    return incompatibilities.permissionCanSatisfy ? "approval" : "blocked";
  if (course.permissionText && !attempt.permissionApproved) return "approval";
  return "planned";
}

export function statusLabel(status: EffectiveStatus) {
  return {
    completed: "Completed",
    failed: "Failed",
    planned: "Planned",
    enrolled: "In progress",
    withdrawn: "Withdrawn",
    blocked: "Blocked",
    approval: "Approval needed",
    review: "Review needed",
    unpublished: "No longer published",
  }[status];
}

type AttemptUnits = (attempt: Attempt) => number;

function catalogueUnits(catalogue?: PlanningCatalogue): AttemptUnits {
  return (attempt) =>
    unitsForAttempt(attempt, planningCourseForAttempt(attempt, catalogue));
}

function earnedUnitsBy(attempts: readonly Attempt[], unitsOf: AttemptUnits) {
  const completed = new Map(
    attempts
      .filter((attempt) => attempt.status === "completed")
      .map((attempt) => [attempt.courseCode, attempt]),
  );
  return [...completed.values()].reduce(
    (total, attempt) => total + unitsOf(attempt),
    0,
  );
}

function mappedUnitsBy(attempts: readonly Attempt[], unitsOf: AttemptUnits) {
  const latest = new Map<string, Attempt>();
  attempts
    .filter(isActiveAttempt)
    .forEach((attempt) => latest.set(attempt.courseCode, attempt));
  return [...latest.values()].reduce(
    (total, attempt) => total + unitsOf(attempt),
    0,
  );
}

export function earnedUnits(
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
) {
  return earnedUnitsBy(attempts, catalogueUnits(catalogue));
}

export function mappedUnits(
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
) {
  return mappedUnitsBy(attempts, catalogueUnits(catalogue));
}

export function unitsByCalendarYear(
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
) {
  const availableTerms = termsFor(catalogue);
  const years = [
    ...new Set(
      availableTerms
        .filter((term) => term.id !== "unscheduled")
        .map((term) => term.year),
    ),
  ];
  return years.map((year) => {
    const inYear = attempts.filter((attempt) => {
      const term = availableTerms.find((item) => item.id === attempt.termId);
      return term?.year === year && isActiveAttempt(attempt);
    });
    const completed = inYear
      .filter((attempt) => attempt.status === "completed")
      .reduce((total, attempt) => {
        const course = planningCourseForAttempt(attempt, catalogue);
        return total + unitsForAttempt(attempt, course);
      }, 0);
    const planned = inYear
      .filter((attempt) => attempt.status !== "completed")
      .reduce((total, attempt) => {
        const course = planningCourseForAttempt(attempt, catalogue);
        return total + unitsForAttempt(attempt, course);
      }, 0);
    return { year, completed, planned, total: completed + planned };
  });
}

export function courseIsAvailable(course: Course, termName: string) {
  if (termName === "Later") return true;
  return course.sessions.includes(termName);
}

export function degreeUnitProgress(
  attempts: Attempt[],
  totalUnits: number,
  catalogue?: PlanningCatalogue,
): DegreeUnitProgress {
  return degreeUnitProgressBy(attempts, totalUnits, catalogueUnits(catalogue));
}

/**
 * Degree progress when each attempt's units come from somewhere other than
 * the planning catalogue, such as the admin view of a student's plan. The
 * counting rules match the student's own view.
 */
export function degreeUnitProgressBy(
  attempts: readonly Attempt[],
  totalUnits: number,
  unitsOf: AttemptUnits,
): DegreeUnitProgress {
  const completed = earnedUnitsBy(attempts, unitsOf);
  const mapped = mappedUnitsBy(attempts, unitsOf);
  const planned = Math.max(0, mapped - completed);
  const remaining = Math.max(0, totalUnits - mapped);
  return {
    completed,
    planned,
    remaining,
    mapped,
    total: totalUnits,
    percent: totalUnits === 0 ? 0 : Math.round((completed / totalUnits) * 100),
  };
}

export function termLoad(
  attempts: Attempt[],
  termId: string,
  ignoreAttemptId?: string,
  catalogue?: PlanningCatalogue,
) {
  const entries = attempts.filter(
    (attempt) =>
      attempt.termId === termId &&
      isActiveAttempt(attempt) &&
      attempt.id !== ignoreAttemptId,
  );
  return {
    courses: entries.length,
    units: entries.reduce((total, attempt) => {
      const course = planningCourseForAttempt(attempt, catalogue);
      return total + unitsForAttempt(attempt, course);
    }, 0),
  };
}

export function termHasCapacity(
  attempts: Attempt[],
  termId: string,
  extraUnits: number,
  extraCourses = 1,
  ignoreAttemptId?: string,
  catalogue?: PlanningCatalogue,
) {
  if (termId === "unscheduled") return true;
  const load = termLoad(attempts, termId, ignoreAttemptId, catalogue);
  return (
    load.courses + extraCourses <= STANDARD_COURSE_SLOTS &&
    load.units + extraUnits <= STANDARD_TERM_UNITS
  );
}

function activeAttemptFor(attempts: Attempt[], courseCode: string) {
  return attempts.find(
    (attempt) => attempt.courseCode === courseCode && isActiveAttempt(attempt),
  );
}

export function isRecommendedDegreeCourse(
  course: Course,
  majorCodes: string[],
) {
  if (majorCodes.includes(course.code)) return true;
  return course.countsTowards.some(
    (item) =>
      item === "Computing core" ||
      item === "Degree core" ||
      item.includes("Mathematics"),
  );
}

/**
 * Core, mathematics and major courses that fit this study period: offered,
 * not already in the plan, and with prerequisites already sequenced earlier.
 */
export function recommendedCoursesForTerm(
  term: Term,
  attempts: Attempt[],
  majorCodes: string[],
  catalogue?: PlanningCatalogue,
): Course[] {
  return coursesFor(catalogue)
    .filter((course) => {
      if (course.year !== term.year) return false;
      if (!isRecommendedDegreeCourse(course, majorCodes)) return false;
      if (!courseIsAvailable(course, term.name)) return false;
      const taken = attempts.filter(
        (attempt) => attempt.courseCode === course.code,
      ).length;
      if (taken >= (course.units === 12 ? 2 : 1)) return false;
      if (activeAttemptFor(attempts, course.code)) return false;
      const preview: Attempt = {
        id: `recommended-${course.code}`,
        academicYear: course.year,
        courseCode: course.code,
        termId: term.id,
        status: "planned",
      };
      return (
        evaluateCoursePrerequisites(preview, [...attempts, preview], catalogue)
          .state === "satisfied" &&
        evaluateCourseIncompatibilities(
          preview,
          [...attempts, preview],
          catalogue,
        ).state === "satisfied"
      );
    })
    .sort(
      (left, right) =>
        left.level - right.level || left.code.localeCompare(right.code),
    );
}

function applyFixStep(attempts: Attempt[], step: PlanFixStep): Attempt[] {
  if (step.type === "move") {
    return attempts.map((attempt) =>
      attempt.id === step.attemptId
        ? { ...attempt, termId: step.toTermId }
        : attempt,
    );
  }
  return [
    ...attempts,
    {
      id: `fix-${step.courseCode}-${step.termId}`,
      academicYear: step.academicYear,
      courseCode: step.courseCode,
      termId: step.termId,
      status: "planned",
    },
  ];
}

function earlierOfferingFor(
  course: Course,
  beforeTermId: string,
  attempts: Attempt[],
  ignoreAttemptId?: string,
  catalogue?: PlanningCatalogue,
) {
  const beforeOrder = orderOf(beforeTermId, catalogue);
  const candidates = termsFor(catalogue).filter(
    (term) =>
      term.id !== "unscheduled" &&
      term.year === course.year &&
      orderOf(term.id, catalogue) < beforeOrder &&
      courseIsAvailable(course, term.name) &&
      termHasCapacity(
        attempts,
        term.id,
        course.units,
        1,
        ignoreAttemptId,
        catalogue,
      ),
  );
  return candidates.at(-1);
}

function placePrerequisiteEarlier(
  courseCode: string,
  beforeTermId: string,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
): PlanFixResult {
  const existing = activeAttemptFor(attempts, courseCode);
  if (
    existing &&
    (existing.status === "completed" || existing.status === "enrolled")
  ) {
    return {
      ok: false,
      message: `${courseCode} is already recorded and cannot be moved earlier.`,
    };
  }

  if (existing) {
    const course = planningCourseForAttempt(existing, catalogue);
    if (!course) {
      return {
        ok: false,
        message: `${courseCode} is not available for its selected academic year.`,
      };
    }
    const target = earlierOfferingFor(
      course,
      beforeTermId,
      attempts,
      existing.id,
      catalogue,
    );
    if (!target) {
      const offered = course.sessions.join(" or ");
      return {
        ok: false,
        message: `No earlier ${offered} offering in ${course.year} with space was found for ${courseCode}.`,
      };
    }
    if (existing.termId === target.id) {
      return {
        ok: false,
        message: `${courseCode} is already as early as the available offerings allow.`,
      };
    }
    return {
      ok: true,
      steps: [
        {
          type: "move",
          attemptId: existing.id,
          courseCode,
          fromTermId: existing.termId,
          toTermId: target.id,
        },
      ],
      summary: `Move ${courseCode} to ${target.name} ${target.year}`,
    };
  }

  const editions = coursesFor(catalogue).filter(
    (course) => course.code === courseCode,
  );
  if (editions.length === 0) {
    return { ok: false, message: `${courseCode} is not in the catalogue.` };
  }
  const candidate = editions
    .flatMap((course) => {
      const target = earlierOfferingFor(
        course,
        beforeTermId,
        attempts,
        undefined,
        catalogue,
      );
      return target ? [{ course, target }] : [];
    })
    .toSorted(
      (left, right) =>
        orderOf(right.target.id, catalogue) -
        orderOf(left.target.id, catalogue),
    )[0];
  if (!candidate) {
    const offered = [
      ...new Set(editions.flatMap((course) => course.sessions)),
    ].join(" or ");
    return {
      ok: false,
      message: `No earlier ${offered} offering with space was found for ${courseCode}.`,
    };
  }

  return {
    ok: true,
    steps: [
      {
        type: "add",
        academicYear: candidate.course.year,
        courseCode,
        termId: candidate.target.id,
      },
    ],
    summary: `Add ${courseCode} to ${candidate.target.name} ${candidate.target.year}`,
  };
}

function describeFixSteps(steps: PlanFixStep[], catalogue?: PlanningCatalogue) {
  return steps
    .map((step) => {
      const term = termsFor(catalogue).find((item) =>
        step.type === "move"
          ? item.id === step.toTermId
          : item.id === step.termId,
      );
      const when = term
        ? `${term.name} ${term.year}`
        : step.type === "move"
          ? step.toTermId
          : step.termId;
      return step.type === "move"
        ? `move ${step.courseCode} to ${when}`
        : `add ${step.courseCode} to ${when}`;
    })
    .join("; ");
}

/**
 * Sequence missing prerequisites earlier when an offering with spare load
 * exists. Nested prerequisites are resolved in the same pass.
 */
export function proposePrerequisiteFix(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
): PlanFixResult {
  if (effectiveStatus(attempt, attempts, catalogue) !== "blocked") {
    return {
      ok: false,
      message: "This course does not have a sequencing issue to fix.",
    };
  }

  const steps: PlanFixStep[] = [];
  let working = attempts;
  const queue: Attempt[] = [attempt];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current.courseCode)) continue;
    seen.add(current.courseCode);

    for (const code of missingPrereqs(current, working, catalogue)) {
      const placement = placePrerequisiteEarlier(
        code,
        current.termId,
        working,
        catalogue,
      );
      if (!placement.ok) return placement;

      steps.push(...placement.steps);
      working = placement.steps.reduce(applyFixStep, working);
      const placed = activeAttemptFor(working, code);
      if (placed) queue.push(placed);
    }
  }

  if (steps.length === 0) {
    return {
      ok: false,
      message: "Coursemap could not find an earlier offering to resolve this.",
    };
  }

  return {
    ok: true,
    steps,
    summary: `Fix by ${describeFixSteps(steps, catalogue)}`,
  };
}
