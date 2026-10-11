import { sessionShortName } from "@/lib/coursemap/academic-periods";
import type { ProgrammeCollege } from "@/lib/academic/college-enrolment";
import type { EnrolmentMode } from "@/lib/academic/enrolment-mode";
import { validCommencementYear } from "@/lib/academic/commencement-year";
import { minimumMarkStatus } from "@/lib/academic/metrics";
import type {
  Attempt,
  Course,
  Term,
  CourseOverride,
} from "@/lib/coursemap/types";
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
  courseOverrides?: readonly CourseOverride[];
  creditedRequirementUnits?: number;
  snapshotCourses?: readonly Course[];
  terms: readonly Term[];
  commencementYear?: number | null;
  enrolmentMode?: EnrolmentMode | null;
  programmeCodes?: readonly string[];
  programmeColleges?: readonly ProgrammeCollege[];
  /** Course previews evaluate prerequisites against all active work in the plan. */
  evaluationContext?: "whole-plan";
};

export type EffectiveStatus =
  Attempt["status"] | "blocked" | "approval" | "review" | "unpublished";

export const STANDARD_COURSE_SLOTS = 4;
export const STANDARD_TERM_UNITS = 24;
/** Above this many units in a semester, a student needs college permission. */
export const OVERLOAD_PERMISSION_UNITS = 36;

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
 * Planned courses can use the latest earlier edition, or the earliest later one.
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
    (term) => term.id === attempt.termId,
  )?.year;
  const year = attempt.academicYear ?? termYear;
  const exact = planningCourseByCode(attempt.courseCode, catalogue, year);
  if (exact || year === undefined || attempt.status !== "planned") return exact;
  const editions = coursesFor(catalogue)
    .filter((course) => course.code === attempt.courseCode)
    .sort((left, right) => left.year - right.year);
  return editions.findLast((course) => course.year < year) ?? editions[0];
}

/**
 * The course to show for an attempt. A planned course that is no longer
 * published shows as a placeholder carrying its code and no units, so it
 * stays visible until the student removes it.
 */
export function displayCourseForAttempt(
  attempt: Attempt,
  catalogue?: PlanningCatalogue,
): Course | undefined {
  if (attempt.isPublished !== false)
    return planningCourseForAttempt(attempt, catalogue);
  return {
    code: attempt.courseCode,
    name: "No longer published",
    year: attempt.academicYear ?? 0,
    units: 0,
    level: 0,
    subject: "",
    school: "",
    convener: "",
    sessions: [],
    delivery: "",
    description: "",
    prerequisiteText: "",
    prerequisiteCodes: [],
    incompatibilities: [],
    countsTowards: [],
    sourceUrl: "",
    lastChanged: "",
    parseState: "Review",
    accent: "amber",
  };
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
  const targetOrder =
    catalogue?.evaluationContext === "whole-plan"
      ? Infinity
      : orderOf(attempt.termId, catalogue);
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
  /** A course before the term is missing from the catalogue, so its tags are unknown. */
  hasUnknownTags: boolean;
  /** A course before the term has no result yet, so averages can still move. */
  hasPendingResults: boolean;
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
  const targetOrder =
    catalogue?.evaluationContext === "whole-plan"
      ? Infinity
      : orderOf(attempt.termId, catalogue);
  const others = attempts.filter((candidate) => candidate.id !== attempt.id);
  const before = others.filter(
    (candidate) => orderOf(candidate.termId, catalogue) < targetOrder,
  );
  const done = new Map<
    string,
    {
      units: number;
      tags: string[];
      isUnitsKnown: boolean;
      isTagsKnown: boolean;
    }
  >();
  for (const candidate of before.filter(countsTowardsRules)) {
    const course = planningCourseForAttempt(candidate, catalogue);
    const units = unitsForAttempt(candidate, course);
    const previous = done.get(candidate.courseCode);
    // A course missing from the catalogue still has a subject and level in
    // its code. Its units and tags can be unknown.
    done.set(candidate.courseCode, {
      units: (previous?.units ?? 0) + units,
      tags: course?.tags ?? previous?.tags ?? [],
      isUnitsKnown: (previous?.isUnitsKnown ?? true) && (!!course || units > 0),
      isTagsKnown: (previous?.isTagsKnown ?? true) && !!course,
    });
  }
  const commencementYear = catalogue?.commencementYear ?? null;
  const term = termsFor(catalogue).find((item) => item.id === attempt.termId);
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
    hasUnknownTags: [...done.values()].some((course) => !course.isTagsKnown),
    hasPendingResults: before
      .filter(countsTowardsRules)
      .some(
        (candidate) =>
          candidate.status !== "completed" ||
          (candidate.mark === undefined && candidate.resultCode === undefined),
      ),
  };
}

/** A condition with no planner-specific meaning, judged as the course page does. */
function evaluatePlannedCondition(
  condition: CourseRuleCondition,
  record: PlannedRecord,
): PrerequisiteEvaluation {
  // Planned and unmarked courses before the term will move the average
  // either way, so a recorded average cannot settle it.
  if (
    (condition.kind === "wam" || condition.kind === "gpa") &&
    record.hasPendingResults
  )
    return { state: "unknown", missingCodes: [] };
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
  // Tags the catalogue cannot supply might reach the target.
  if (condition.kind === "tagged_units" && record.hasUnknownTags)
    return { state: "unknown", missingCodes: [] };
  // The plan names only the programme, so a structure it does not list may
  // still be one the student is enrolled in.
  if (condition.kind === "structure" || condition.kind === "structure_set")
    return { state: "unknown", missingCodes: [] };
  return { state: "unsatisfied", missingCodes: [] };
}

/**
 * Parsed and verified rules are both checked, as the course page checks them.
 * Only a rule the importer flagged for review is left to the student to read.
 */
function isCheckable(reviewState: string) {
  return reviewState !== "review";
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
  if (!isCheckable(expression.reviewState)) {
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
      if (!targetTerm || !otherTerm) {
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
  if (isCourseBypassed(attempt, catalogue))
    return { state: "satisfied", missingCodes: [] };
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
    !isCheckable(course.prerequisiteRule.reviewState) ||
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
  if (isCourseBypassed(attempt, catalogue))
    return { state: "satisfied", missingCodes: [] };
  const rule = planningCourseForAttempt(
    attempt,
    catalogue,
  )?.incompatibilityRule;
  if (!rule || rule.hardness === "advisory")
    return { state: "satisfied", missingCodes: [] };
  if (!isCheckable(rule.reviewState) || !rule.relationalExpression)
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

export type CoursePlanIssue = {
  code:
    | "prerequisite"
    | "incompatibility"
    | "permission"
    | "unverified"
    | "offering"
    | "overload"
    | "unpublished";
  severity: "hard" | "soft";
  detail: string;
};

export type CoursePlanStatus = {
  lifecycle: "planned" | "enrolled" | "done" | "failed" | "withdrawn";
  issues: CoursePlanIssue[];
};

/** Keeps every issue alongside the attempt's recorded lifecycle. */
export function coursePlanStatus(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
): CoursePlanStatus {
  const lifecycle = attempt.status === "completed" ? "done" : attempt.status;
  const issues: CoursePlanIssue[] = [];
  if (lifecycle !== "planned" && lifecycle !== "enrolled")
    return { lifecycle, issues };
  // A student who took the course anyway has accepted its requirements.
  if (isCourseBypassed(attempt, catalogue)) return { lifecycle, issues };
  const add = (
    code: CoursePlanIssue["code"],
    severity: CoursePlanIssue["severity"],
    detail: string,
  ) => {
    if (!issues.some((issue) => issue.code === code && issue.detail === detail))
      issues.push({ code, severity, detail });
  };
  if (attempt.isPublished === false) {
    add(
      "unpublished",
      "soft",
      "No longer published for this year. Remove it or choose another course.",
    );
    return { lifecycle, issues };
  }
  const course = planningCourseForAttempt(attempt, catalogue);
  if (!course) {
    add(
      "unverified",
      "soft",
      "Coursemap couldn't check this requirement: read it on the course page",
    );
    return { lifecycle, issues };
  }
  const record = lazyPlannedRecord(attempt, attempts, catalogue);
  const check = (
    expression: CourseRuleExpression,
    code: "prerequisite" | "incompatibility",
  ) => {
    // All required clauses can have separate issues. Alternatives stay one decision.
    if (expression.kind === "group" && expression.operator === "all_of") {
      expression.conditions.forEach((child) => check(child, code));
      return;
    }
    const evaluation = evaluateRelationalPrerequisite(
      expression,
      attempt,
      attempts,
      catalogue,
      record,
    );
    report(evaluation, code, expression.kind === "group" ? null : expression);
  };
  const report = (
    evaluation: PrerequisiteEvaluation,
    code: "prerequisite" | "incompatibility",
    expression: Exclude<CourseRuleExpression, { kind: "group" }> | null,
  ) => {
    if (evaluation.state === "satisfied") return;
    if (evaluation.state === "unknown") {
      add(
        "unverified",
        "soft",
        "Coursemap couldn't check this requirement: read it on the course page",
      );
    } else if (evaluation.permissionCanSatisfy) {
      add(
        "permission",
        "soft",
        "Course permission is required before enrolment",
      );
    } else if (
      expression?.kind === "incompatible" ||
      expression?.kind === "incompatible_concurrent"
    ) {
      add("incompatibility", "hard", `Can't be taken with ${expression.code}`);
    } else {
      add(
        code,
        "hard",
        evaluation.missingCodes.length > 0
          ? `Needs ${evaluation.missingCodes.join(" and ")} first`
          : expression?.sourceText ||
              course.prerequisiteText ||
              "A required eligibility condition is not met.",
      );
    }
  };
  for (const [code, rule] of [
    ["prerequisite", course.prerequisiteRule],
    ["incompatibility", course.incompatibilityRule],
  ] as const) {
    if (rule?.hardness === "advisory") continue;
    if (rule && isCheckable(rule.reviewState) && rule.relationalExpression)
      check(rule.relationalExpression, code);
    else if (
      code === "prerequisite" &&
      rule === undefined &&
      course.parseState !== "Verified" &&
      course.prerequisiteCodes.length > 0
    )
      report({ state: "unknown", missingCodes: [] }, code, null);
    else if (
      code === "incompatibility" &&
      rule === undefined &&
      course.incompatibilities.length > 0
    ) {
      if (course.parseState !== "Verified")
        report({ state: "unknown", missingCodes: [] }, code, null);
      else
        for (const conflict of course.incompatibilities) {
          if (
            attempts.some(
              (candidate) =>
                candidate.id !== attempt.id &&
                candidate.courseCode === conflict &&
                countsTowardsRules(candidate),
            )
          )
            add("incompatibility", "hard", `Can't be taken with ${conflict}`);
        }
    } else
      report(
        code === "prerequisite"
          ? evaluateCoursePrerequisites(attempt, attempts, catalogue)
          : evaluateCourseIncompatibilities(attempt, attempts, catalogue),
        code,
        null,
      );
  }
  if (course.permissionText && !attempt.permissionApproved)
    add("permission", "soft", course.permissionText);
  const term = termsFor(catalogue).find((item) => item.id === attempt.termId);
  if (catalogue?.evaluationContext !== "whole-plan" && term) {
    if (course.sessions.length === 0)
      add("offering", "soft", `Offering unconfirmed for ${term.name}`);
    else if (!courseIsAvailable(course, term.name))
      add("offering", "hard", `Not offered in ${term.name}`);
    const load = termLoad(attempts, term.id, undefined, catalogue);
    if (
      load.units > STANDARD_TERM_UNITS ||
      load.courses > STANDARD_COURSE_SLOTS
    )
      add(
        "overload",
        "soft",
        load.units > OVERLOAD_PERMISSION_UNITS
          ? `${load.units} units in ${term.name}: you'll need permission from your college`
          : `Overloaded: ${load.units} units in ${term.name}`,
      );
  }
  return { lifecycle, issues };
}

export function isCourseBypassed(
  attempt: Attempt,
  catalogue?: PlanningCatalogue,
) {
  return (
    attempt.status === "planned" &&
    Boolean(
      catalogue?.courseOverrides?.some(
        (item) => item.courseCode === attempt.courseCode,
      ),
    )
  );
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
  if (
    course.permissionText &&
    !attempt.permissionApproved &&
    !isCourseBypassed(attempt, catalogue)
  )
    return "approval";
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
  const years = [...new Set(availableTerms.map((term) => term.year))];
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

/**
 * Whether a course runs in a term. Imports name the same period differently
 * ("Semester 1", "First Semester"), so names are compared by their period.
 */
export function courseIsAvailable(course: Course, termName: string) {
  const period = sessionShortName(termName);
  return course.sessions.some(
    (session) => session === termName || sessionShortName(session) === period,
  );
}

export function degreeUnitProgress(
  attempts: Attempt[],
  totalUnits: number,
  catalogue?: PlanningCatalogue,
): DegreeUnitProgress {
  return degreeUnitProgressBy(
    attempts,
    totalUnits,
    catalogueUnits(catalogue),
    catalogue?.creditedRequirementUnits ?? 0,
  );
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
  creditedUnits = 0,
): DegreeUnitProgress {
  const completed = earnedUnitsBy(attempts, unitsOf) + creditedUnits;
  const mapped = mappedUnitsBy(attempts, unitsOf) + creditedUnits;
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

/** The calendar year in a term id such as "2026-s1". */
function termYear(termId: string) {
  const match = /^(\d{4})-/u.exec(termId);
  return match ? Number(match[1]) : undefined;
}

/**
 * The plan after one step. A move stamps the new term's year on the course,
 * as moving it on the board does, so the edition it uses follows it.
 */
function applyFixStep(attempts: Attempt[], step: PlanFixStep): Attempt[] {
  if (step.type === "move") {
    return attempts.map((attempt) =>
      attempt.id === step.attemptId
        ? {
            ...attempt,
            termId: step.toTermId,
            academicYear: termYear(step.toTermId) ?? attempt.academicYear,
          }
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

function termLabel(term: Term | undefined, termId: string) {
  return term ? `${sessionShortName(term.name)} ${term.year}` : termId;
}

/** The edition a planned course would use in a term, as the board picks it. */
function editionForTerm(
  courseCode: string,
  term: Term,
  catalogue?: PlanningCatalogue,
) {
  return planningCourseForAttempt(
    {
      id: `probe-${courseCode}-${term.id}`,
      academicYear: term.year,
      courseCode,
      termId: term.id,
      status: "planned",
    },
    catalogue,
  );
}

type Placement =
  | { ok: true; steps: PlanFixStep[]; attempts: Attempt[] }
  | { ok: false; message: string };

/** How deep prerequisites of prerequisites are followed. */
const MAX_PREREQUISITE_DEPTH = 5;
/** Earlier semesters tried for one prerequisite before giving up on it. */
const MAX_SLOTS_TRIED = 4;

/**
 * Semesters before `beforeTermId` that run the course and have room for it,
 * latest first, or why there are none.
 */
function earlierSlots(
  courseCode: string,
  beforeTermId: string,
  attempts: Attempt[],
  ignoreAttemptId: string | undefined,
  catalogue?: PlanningCatalogue,
):
  | { ok: true; slots: { term: Term; course: Course }[] }
  | { ok: false; message: string } {
  const terms = termsFor(catalogue);
  const beforeOrder = orderOf(beforeTermId, catalogue);
  const before = terms.find((term) => term.id === beforeTermId);
  const offered = terms
    .filter((term) => orderOf(term.id, catalogue) < beforeOrder)
    .flatMap((term) => {
      const course = editionForTerm(courseCode, term, catalogue);
      return course && courseIsAvailable(course, term.name)
        ? [{ term, course }]
        : [];
    });
  if (offered.length === 0) {
    const known = coursesFor(catalogue).some(
      (course) => course.code === courseCode,
    );
    return {
      ok: false,
      message: known
        ? `${courseCode} doesn't run in any semester in your plan before ${termLabel(before, beforeTermId)}.`
        : `Coursemap doesn't have ${courseCode}'s offerings, so it can't place it.`,
    };
  }
  const open = offered.filter(({ term, course }) =>
    termHasCapacity(
      attempts,
      term.id,
      course.units,
      1,
      ignoreAttemptId,
      catalogue,
    ),
  );
  if (open.length === 0) {
    const full = offered
      .slice(-3)
      .map(({ term }) => termLabel(term, term.id))
      .join(", ");
    return {
      ok: false,
      message: `${courseCode} only fits before ${termLabel(before, beforeTermId)} in semesters that are already full (${full}).`,
    };
  }
  return { ok: true, slots: open.toReversed() };
}

/**
 * Puts one prerequisite in an earlier semester: moves it when it is already
 * planned, adds it otherwise, then does the same for whatever it needs.
 */
function placeEarlier(
  courseCode: string,
  beforeTermId: string,
  attempts: Attempt[],
  catalogue: PlanningCatalogue | undefined,
  depth: number,
): Placement {
  const existing = activeAttemptFor(attempts, courseCode);
  if (existing && existing.status !== "planned") {
    const term = termsFor(catalogue).find(
      (item) => item.id === existing.termId,
    );
    return {
      ok: false,
      message: `${courseCode} is recorded in ${termLabel(term, existing.termId)}, so Coursemap won't move it.`,
    };
  }
  const found = earlierSlots(
    courseCode,
    beforeTermId,
    attempts,
    existing?.id,
    catalogue,
  );
  if (!found.ok) return found;
  let failure: Placement = found.slots.length
    ? { ok: false, message: "" }
    : { ok: false, message: `No semester has room for ${courseCode}.` };
  for (const { term } of found.slots.slice(0, MAX_SLOTS_TRIED)) {
    const step: PlanFixStep = existing
      ? {
          type: "move",
          attemptId: existing.id,
          courseCode,
          fromTermId: existing.termId,
          toTermId: term.id,
        }
      : { type: "add", academicYear: term.year, courseCode, termId: term.id };
    const next = applyFixStep(attempts, step);
    const placed = existing
      ? next.find((item) => item.id === existing.id)
      : activeAttemptFor(next, courseCode);
    if (!placed) continue;
    const nested = placeMissingBefore(placed, next, catalogue, depth + 1);
    if (nested.ok)
      return {
        ok: true,
        steps: [step, ...nested.steps],
        attempts: nested.attempts,
      };
    failure = nested;
  }
  return failure;
}

/** Every course `attempt` is missing, placed before it. */
function placeMissingBefore(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue: PlanningCatalogue | undefined,
  depth: number,
): Placement {
  if (depth > MAX_PREREQUISITE_DEPTH)
    return {
      ok: false,
      message: `${attempt.courseCode}'s prerequisites go back further than Coursemap will rearrange.`,
    };
  let working = attempts;
  const steps: PlanFixStep[] = [];
  for (const code of missingPrereqs(attempt, working, catalogue)) {
    // An earlier placement may already have brought this one in.
    if (!missingPrereqs(attempt, working, catalogue).includes(code)) continue;
    const placed = placeEarlier(
      code,
      attempt.termId,
      working,
      catalogue,
      depth,
    );
    if (!placed.ok) return placed;
    steps.push(...placed.steps);
    working = placed.attempts;
  }
  return { ok: true, steps, attempts: working };
}

/**
 * Whether the plan after `steps` clears the course without blocking anything
 * that was not already blocked, the courses the fix places included.
 */
function fixClearsBlock(
  attempt: Attempt,
  attempts: Attempt[],
  steps: readonly PlanFixStep[],
  catalogue?: PlanningCatalogue,
) {
  const after = steps.reduce(applyFixStep, attempts);
  const target = after.find((item) => item.id === attempt.id);
  if (!target || effectiveStatus(target, after, catalogue) === "blocked")
    return false;
  const blockedBefore = new Set(
    attempts
      .filter(
        (item) =>
          item.status === "planned" &&
          effectiveStatus(item, attempts, catalogue) === "blocked",
      )
      .map((item) => item.id),
  );
  return after.every(
    (item) =>
      item.id === attempt.id ||
      item.status !== "planned" ||
      blockedBefore.has(item.id) ||
      effectiveStatus(item, after, catalogue) !== "blocked",
  );
}

/** "Move COMP1110 to S2 2026 and add MATH1005 to S1 2026". */
function describeFixSteps(steps: PlanFixStep[], catalogue?: PlanningCatalogue) {
  const phrases = steps.map((step) => {
    const termId = step.type === "move" ? step.toTermId : step.termId;
    const term = termsFor(catalogue).find((item) => item.id === termId);
    return `${step.type === "move" ? "move" : "add"} ${step.courseCode} to ${termLabel(term, termId)}`;
  });
  const sentence =
    phrases.length > 1
      ? `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}`
      : (phrases[0] ?? "");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** What the student can do about an issue Coursemap can't rearrange away. */
function explainIssue(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
) {
  const code = attempt.courseCode;
  const issues = coursePlanStatus(attempt, attempts, catalogue).issues;
  const incompatible = issues.find((issue) => issue.code === "incompatibility");
  if (incompatible)
    return `${incompatible.detail}. Remove one of them from your plan.`;
  if (issues.some((issue) => issue.code === "permission"))
    return `${code} needs permission from the course convener. Coursemap can't arrange that. Once you have it, take it anyway.`;
  if (issues.some((issue) => issue.code === "unverified"))
    return `Coursemap can't read one of ${code}'s requirements. Check them on the course page, and take it anyway if you meet them.`;
  const prerequisite = issues.find(
    (issue) => issue.code === "prerequisite" && issue.severity === "hard",
  );
  if (prerequisite)
    return `${prerequisite.detail.replace(/\.$/u, "")}. Coursemap can only rearrange courses, so check you meet it or take it anyway.`;
  return `${code} has nothing Coursemap can rearrange.`;
}

/**
 * A way to clear a course blocked by missing prerequisites, using only the
 * plan's planned courses and semesters with room. It tries placing the
 * prerequisites (and theirs) earlier in any year, and moving the course to a
 * later offering with the prerequisites placed before it, and keeps the
 * shortest arrangement that clears the block without blocking anything else.
 * When none does, the message says why. It never overloads a semester or
 * moves a recorded result.
 */
export function proposePrerequisiteFix(
  attempt: Attempt,
  attempts: Attempt[],
  catalogue?: PlanningCatalogue,
): PlanFixResult {
  if (attempt.status !== "planned")
    return {
      ok: false,
      message: "Only planned courses can be rearranged.",
    };
  if (
    effectiveStatus(attempt, attempts, catalogue) !== "blocked" ||
    missingPrereqs(attempt, attempts, catalogue).length === 0
  )
    return { ok: false, message: explainIssue(attempt, attempts, catalogue) };

  const options: PlanFixStep[][] = [];
  const failures: string[] = [];
  const earlier = placeMissingBefore(attempt, attempts, catalogue, 0);
  if (earlier.ok && earlier.steps.length > 0) options.push(earlier.steps);
  else if (!earlier.ok) failures.push(earlier.message);

  const fromOrder = orderOf(attempt.termId, catalogue);
  const later = termsFor(catalogue).filter((term) => {
    if (orderOf(term.id, catalogue) <= fromOrder) return false;
    const course = editionForTerm(attempt.courseCode, term, catalogue);
    return (
      course !== undefined &&
      courseIsAvailable(course, term.name) &&
      termHasCapacity(attempts, term.id, course.units, 1, attempt.id, catalogue)
    );
  });
  for (const term of later) {
    const move: PlanFixStep = {
      type: "move",
      attemptId: attempt.id,
      courseCode: attempt.courseCode,
      fromTermId: attempt.termId,
      toTermId: term.id,
    };
    const moved = applyFixStep(attempts, move);
    const movedAttempt = moved.find((item) => item.id === attempt.id);
    if (!movedAttempt) continue;
    // Later may already be enough; otherwise fit the prerequisites in first.
    const placed = placeMissingBefore(movedAttempt, moved, catalogue, 0);
    if (!placed.ok) continue;
    const steps = [move, ...placed.steps];
    if (fixClearsBlock(attempt, attempts, steps, catalogue)) {
      options.push(steps);
      break;
    }
  }
  if (later.length === 0) {
    const course = planningCourseForAttempt(attempt, catalogue);
    failures.push(
      course
        ? `No later semester that runs ${attempt.courseCode} has room for it.`
        : `Coursemap doesn't have ${attempt.courseCode}'s offerings.`,
    );
  }

  const best = options
    .filter((steps) => fixClearsBlock(attempt, attempts, steps, catalogue))
    .reduce<PlanFixStep[] | null>(
      (shortest, steps) =>
        shortest === null || steps.length < shortest.length ? steps : shortest,
      null,
    );
  if (best)
    return {
      ok: true,
      steps: best,
      summary: describeFixSteps(best, catalogue),
    };
  return {
    ok: false,
    message:
      failures[0] ??
      `Coursemap couldn't find a way to fit ${attempt.courseCode}'s prerequisites in without blocking another course.`,
  };
}
