import { enrolmentModeConditionLabel } from "@/lib/academic/enrolment-mode";
import { commencementYearLabel } from "@/lib/academic/commencement-year";
import { courseFilterLabel } from "@/lib/academic/course-code";
import {
  careerConditionLabel,
  programmeCareerLabel,
} from "@/lib/academic/programme-career";
import { catalogueKindForCode } from "@/lib/catalogue/record-reference";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  groupOperator,
  isSoftExpression,
} from "@/lib/coursemap/requisite-evaluation";
import type { CourseRuleCondition } from "@/lib/coursemap/requisite-tree";

type Group = Extract<CourseRuleExpression, { kind: "group" }>;

function onlyExclusions(node: CourseRuleExpression): boolean {
  return node.kind === "group"
    ? node.conditions.every(onlyExclusions)
    : node.kind === "incompatible" || node.kind === "incompatible_concurrent";
}

/**
 * Pulls the parts of a rule that are not course relationships out of its
 * top level: a permission is a gate on the course, free text is a note, and
 * an incompatibility is not a prerequisite at all. What remains is what the
 * student has to complete, one entry per thing to do.
 */
export function splitRequisiteRule(expression: CourseRuleExpression | null) {
  const permissions: string[] = [];
  const notes: string[] = [];
  const incompatible: string[] = [];
  const concurrentIncompatible: string[] = [];
  const advisoryIncompatible: CourseRuleCondition[] = [];
  /** Soft requirements: shown to the student, never blocking enrolment. */
  const soft: CourseRuleExpression[] = [];
  const requirements: CourseRuleExpression[] = [];
  const visit = (node: CourseRuleExpression) => {
    if (
      (node.kind === "incompatible" ||
        node.kind === "incompatible_concurrent") &&
      node.hardness === "advisory"
    )
      advisoryIncompatible.push(node);
    // Advisory exclusions keep their own step, so only a soft group with
    // something other than exclusions in it becomes a soft requirement.
    else if (isSoftExpression(node) && !onlyExclusions(node)) soft.push(node);
    else if (node.kind === "permission") permissions.push(node.text);
    else if (node.kind === "other") notes.push(node.text);
    else if (node.kind === "incompatible_concurrent")
      concurrentIncompatible.push(node.code);
    else if (node.kind === "incompatible") incompatible.push(node.code);
    else if (node.kind === "group" && groupOperator(node) === "all_of")
      node.conditions.forEach(visit);
    else if (node.kind === "group" && node.conditions.length === 1)
      visit(node.conditions[0]!);
    else requirements.push(node);
  };
  if (expression) visit(expression);
  return {
    requirements,
    permissions,
    notes,
    incompatible,
    concurrentIncompatible,
    advisoryIncompatible,
    soft,
  };
}

/** Whether Coursemap can check a condition against a student's record. */
function isCheckableCondition(condition: CourseRuleCondition) {
  switch (condition.kind) {
    case "other":
    case "permission":
    case "field_units":
    case "elective_units":
      return false;
    case "structure":
      return condition.structureCode !== null;
    case "gpa":
    case "wam":
      return !(
        condition.scopeText?.trim() &&
        !condition.subjects?.length &&
        !condition.courseCodes?.length
      );
    default:
      return true;
  }
}

/**
 * How a soft requirement is introduced: advice Coursemap can check is
 * "Recommended"; a condition it cannot check is something the student will
 * also need to arrange, such as an audition or a placement.
 */
export function softRequirementLabel(
  expression: CourseRuleExpression,
): "Recommended" | "You'll also need" {
  const checkable = (node: CourseRuleExpression): boolean =>
    node.kind === "group"
      ? node.conditions.every(checkable)
      : isCheckableCondition(node);
  return checkable(expression) ? "Recommended" : "You'll also need";
}

/** The heading on a group box: how many of its children are needed. */
export function groupLabel(group: Group) {
  const count = group.conditions.length;
  const operator = groupOperator(group);
  if (operator === "all_of") return count === 2 ? "Both" : `All ${count}`;
  if (operator === "any_of") return `Any 1 of ${count}`;
  return `Any ${group.minimumCount ?? 1} of ${count}`;
}

function levelPhrase(minimum: number, maximum: number | null) {
  if (maximum === null) return `${minimum}-level or higher`;
  return minimum === maximum
    ? `${minimum}-level`
    : `${minimum}- to ${maximum}-level`;
}

function codes(list: readonly string[]) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} or ${list.at(-1)}`;
}

function filteredCount(
  condition: Extract<CourseRuleCondition, { kind: "course_count" }>,
) {
  return `${condition.minimumCount} ${courseFilterLabel(
    { subjectCodes: condition.subjects, courseLevels: condition.levels },
    condition.minimumCount === 1,
  )}`;
}

function filteredUnits(
  condition: Extract<CourseRuleCondition, { kind: "filtered_units" }>,
) {
  return `${condition.units} units of ${courseFilterLabel({
    subjectCodes: condition.subjects,
    courseLevels: condition.levels,
  })}`;
}

/** What a grade average is taken over: some courses, a recent window or the career. */
function averageScopePhrase(
  condition: Extract<CourseRuleCondition, { kind: "gpa" | "wam" }>,
  article: "the" | "your",
) {
  if (condition.subjects?.length)
    return ` in ${codes(condition.subjects)} courses`;
  if (condition.courseCodes?.length)
    return ` across ${codes(condition.courseCodes).replace(/ or /u, " and ")}`;
  if (condition.scopeText?.trim()) return ` in ${condition.scopeText.trim()}`;
  return condition.recentGradedUnits
    ? ` over ${article} most recent ${condition.recentGradedUnits} graded units`
    : " across your academic career";
}

/** "the MATH-MAJ major" for a major, minor or specialisation code. */
function structureName(code: string) {
  const kind = catalogueKindForCode(code);
  return kind === "major" || kind === "minor" || kind === "specialisation"
    ? `the ${code} ${kind}`
    : code;
}

/** A condition as a short label for a diagram box. */
export function requisiteNoun(condition: CourseRuleCondition): string {
  switch (condition.kind) {
    case "college_enrolment":
      return `Programme offered by ${condition.college}`;
    case "course":
      return condition.code;
    case "incompatible_concurrent":
      return `Not concurrent with ${condition.code}`;
    case "incompatible":
      return `Not ${condition.code}`;
    case "units_total":
      return `${condition.units} units in total`;
    case "subject_courses":
      return `${condition.minimumCount} completed ${condition.subject} ${condition.minimumCount === 1 ? "course" : "courses"}`;
    case "subject_units":
      return `${condition.units} units of ${condition.subject ?? "subject"} courses`;
    case "course_count":
      return filteredCount(condition);
    case "filtered_units":
      return filteredUnits(condition);
    case "career":
      return `${condition.matchesCareer ? "Enrolled in" : "Not enrolled in"} ${programmeCareerLabel(condition.career)}`;
    case "level_units":
      return `${condition.units} units of ${levelPhrase(condition.minimumLevel, condition.maximumLevel)}${
        condition.subject ? ` ${condition.subject}` : ""
      } courses`;
    case "course_set_units":
      return `${condition.units} units from ${codes(condition.courseCodes)}`;
    case "tagged_units":
      return `${condition.units} units tagged ${condition.tag}`;
    case "elective_units":
      return `${condition.units} units of electives`;
    case "enrolment_mode":
      return enrolmentModeConditionLabel(condition);
    case "commencement_year":
      return commencementYearLabel(condition);
    case "year_standing":
      return `Year ${condition.minimumYear} or later`;
    case "structure":
      return `Enrolled in ${condition.structureCode ? structureName(condition.structureCode) : (condition.text ?? "a program")}`;
    case "structure_set":
      return condition.minimumCount && condition.minimumCount > 1
        ? `Enrolled in ${condition.minimumCount} of ${codes(condition.structureCodes)}`
        : `Enrolled in ${codes(condition.structureCodes)}`;
    case "gpa":
      return `GPA of ${condition.minimumGpa} or more${averageScopePhrase(condition, "the")}`;
    case "wam":
      return `WAM of ${condition.minimumWam} or more${averageScopePhrase(condition, "the")}`;
    case "field_units":
      return `${condition.units} units in ${condition.field}`;
    case "subject_sequence":
      return `No later ${condition.subject} course completed`;
    case "permission":
    case "other":
      return condition.text;
  }
}

/** A condition as the thing a student has to do, for the steps list. */
export function requisiteSentence(condition: CourseRuleCondition): string {
  switch (condition.kind) {
    case "college_enrolment":
      return `Be enrolled in a programme offered by ${condition.college}`;
    case "course": {
      const completed = `Complete ${condition.code}${condition.minimumMark === null ? "" : ` with a mark of ${condition.minimumMark} or more`}`;
      return condition.requirementMode === "completed_or_concurrent"
        ? `${completed}, or take it in the same semester`
        : completed;
    }
    case "incompatible_concurrent":
      return `You can't take this in the same semester as ${condition.code}`;
    case "incompatible":
      return `You can't take this if you've completed ${condition.code}`;
    case "units_total":
      return `Complete ${condition.units} units`;
    case "subject_courses":
      return `Complete ${condition.minimumCount} ${condition.subject} ${condition.minimumCount === 1 ? "course" : "courses"}`;
    case "subject_units":
      return `Complete ${condition.units} units of ${condition.subject ?? "subject"} courses`;
    case "course_count":
      return `Complete ${filteredCount(condition)}${
        condition.requirementMode === "completed_or_concurrent"
          ? condition.minimumCount === 1
            ? " (or be enrolled in it)"
            : " (or be enrolled in them)"
          : ""
      }`;
    case "filtered_units":
      return `Complete ${filteredUnits(condition)}${
        condition.requirementMode === "completed_or_concurrent"
          ? " (or be enrolled in them)"
          : ""
      }`;
    case "career":
      return careerConditionLabel(condition);
    case "level_units":
      return `Complete ${requisiteNoun(condition)}`;
    case "course_set_units":
      return `Complete ${condition.units} units from these courses`;
    case "tagged_units":
      return `Complete ${condition.units} units of courses tagged ${condition.tag}`;
    case "elective_units":
      return `Complete ${condition.units} units of electives`;
    case "enrolment_mode":
      return enrolmentModeConditionLabel(condition);
    case "commencement_year":
      return commencementYearLabel(condition);
    case "year_standing":
      return `Be in year ${condition.minimumYear} or later of your degree`;
    case "structure":
      return `Be enrolled in ${condition.structureCode ? structureName(condition.structureCode) : (condition.text ?? "the required program")}`;
    case "structure_set":
      return condition.minimumCount && condition.minimumCount > 1
        ? `Be enrolled in ${condition.minimumCount} of these programs`
        : "Be enrolled in one of these programs";
    case "gpa":
      return `Have a GPA of ${condition.minimumGpa} or more${averageScopePhrase(condition, "your")}`;
    case "wam":
      return `Have a WAM of ${condition.minimumWam} or more${averageScopePhrase(condition, "your")}`;
    case "field_units":
      return `Complete ${condition.units} units in ${condition.field}`;
    case "subject_sequence":
      return `Don't take this after completing a later ${condition.subject} course in the sequence`;
    case "permission":
      return "Get permission to enrol";
    case "other":
      return "Also required";
  }
}

/** A group as the thing a student has to do. */
export function hasUniformCourseActions(group: Group) {
  const first = group.conditions[0];
  return (
    first?.kind === "course" &&
    group.conditions.every(
      (child) =>
        child.kind === "course" &&
        child.requirementMode === first.requirementMode &&
        child.minimumMark === first.minimumMark,
    )
  );
}

export function groupSentence(group: Group) {
  const allCourses =
    hasUniformCourseActions(group) &&
    group.conditions[0]?.kind === "course" &&
    group.conditions[0].requirementMode === "completed" &&
    group.conditions[0].minimumMark === null;
  const noun = allCourses ? "these courses" : "these";
  const verb = allCourses ? "Complete" : "Meet";
  const operator = groupOperator(group);
  if (operator === "all_of") return `${verb} all of ${noun}`;
  if (operator === "any_of") return `${verb} one of ${noun}`;
  return `${verb} any ${group.minimumCount ?? 1} of ${noun}`;
}

/**
 * Where to see the courses that count towards a unit requirement: the course
 * explorer, filtered the way the rule is worded. Requirements that name their
 * own courses link through those courses instead, so they have none.
 */
export function requisiteExplorerLink(
  condition: CourseRuleCondition,
  academicYear: number,
): { href: string; label: string } | null {
  const params = new URLSearchParams({ year: String(academicYear) });
  switch (condition.kind) {
    case "subject_courses":
    case "subject_units":
      if (!condition.subject) return null;
      params.set("subject", condition.subject);
      return {
        href: `/courses?${params}`,
        label: `See ${condition.subject} courses`,
      };
    case "level_units": {
      const level = condition.minimumLevel / 1000;
      params.set(
        "level",
        condition.maximumLevel === condition.minimumLevel
          ? String(level)
          : `${level}+`,
      );
      if (condition.subject) params.set("subject", condition.subject);
      return {
        href: `/courses?${params}`,
        label: `See ${levelPhrase(condition.minimumLevel, condition.maximumLevel)}${
          condition.subject ? ` ${condition.subject}` : ""
        } courses`,
      };
    }
    case "tagged_units":
      params.set("tag", condition.tag);
      return {
        href: `/courses?${params}`,
        label: `See courses tagged ${condition.tag}`,
      };
    default:
      return null;
  }
}
