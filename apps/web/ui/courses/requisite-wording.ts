import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { CourseRuleCondition } from "@/lib/coursemap/requisite-tree";

type Group = Extract<CourseRuleExpression, { kind: "group" }>;

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
  const requirements: CourseRuleExpression[] = [];
  const visit = (node: CourseRuleExpression) => {
    if (node.kind === "permission") permissions.push(node.text);
    else if (node.kind === "other") notes.push(node.text);
    else if (node.kind === "incompatible") incompatible.push(node.code);
    else if (node.kind === "group" && node.operator === "all_of")
      node.conditions.forEach(visit);
    else if (node.kind === "group" && node.conditions.length === 1)
      visit(node.conditions[0]!);
    else requirements.push(node);
  };
  if (expression) visit(expression);
  return { requirements, permissions, notes, incompatible };
}

/** The heading on a group box: how many of its children are needed. */
export function groupLabel(group: Group) {
  const count = group.conditions.length;
  if (group.operator === "all_of") return count === 2 ? "Both" : `All ${count}`;
  if (group.operator === "any_of") return `Any 1 of ${count}`;
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

/** A condition as a short label for a diagram box. */
export function requisiteNoun(condition: CourseRuleCondition): string {
  switch (condition.kind) {
    case "course":
      return condition.code;
    case "incompatible":
      return `Not ${condition.code}`;
    case "units_total":
      return `${condition.units} units in total`;
    case "subject_units":
      return `${condition.units} units of ${condition.subject ?? "subject"} courses`;
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
    case "year_standing":
      return `Year ${condition.minimumYear} or later`;
    case "structure":
      return `Enrolled in ${condition.structureCode ?? condition.text ?? "a program"}`;
    case "structure_set":
      return condition.minimumCount && condition.minimumCount > 1
        ? `Enrolled in ${condition.minimumCount} of ${codes(condition.structureCodes)}`
        : `Enrolled in ${codes(condition.structureCodes)}`;
    case "gpa":
      return `GPA of ${condition.minimumGpa} or more`;
    case "wam":
      return `WAM of ${condition.minimumWam} or more`;
    case "permission":
    case "other":
      return condition.text;
  }
}

/** A condition as the thing a student has to do, for the steps list. */
export function requisiteSentence(condition: CourseRuleCondition): string {
  switch (condition.kind) {
    case "course":
      if (condition.minimumMark !== null)
        return `Complete ${condition.code} with a mark of ${condition.minimumMark} or more`;
      return condition.requirementMode === "completed_or_concurrent"
        ? `Complete ${condition.code}, or take it in the same semester`
        : `Complete ${condition.code}`;
    case "incompatible":
      return `You can't take this if you've completed ${condition.code}`;
    case "units_total":
      return `Complete ${condition.units} units`;
    case "subject_units":
      return `Complete ${condition.units} units of ${condition.subject ?? "subject"} courses`;
    case "level_units":
      return `Complete ${requisiteNoun(condition)}`;
    case "course_set_units":
      return `Complete ${condition.units} units from these courses`;
    case "tagged_units":
      return `Complete ${condition.units} units of courses tagged ${condition.tag}`;
    case "elective_units":
      return `Complete ${condition.units} units of electives`;
    case "year_standing":
      return `Be in year ${condition.minimumYear} or later of your degree`;
    case "structure":
      return `Be enrolled in ${condition.structureCode ?? condition.text ?? "the required program"}`;
    case "structure_set":
      return condition.minimumCount && condition.minimumCount > 1
        ? `Be enrolled in ${condition.minimumCount} of these programs`
        : "Be enrolled in one of these programs";
    case "gpa":
      return `Have a GPA of ${condition.minimumGpa} or more`;
    case "wam":
      return `Have a WAM of ${condition.minimumWam} or more`;
    case "permission":
      return "Get permission to enrol";
    case "other":
      return "Also required";
  }
}

/** A group as the thing a student has to do. */
export function groupSentence(group: Group) {
  const allCourses = group.conditions.every((child) => child.kind === "course");
  const noun = allCourses ? "these courses" : "these";
  const verb = allCourses ? "Complete" : "Meet";
  if (group.operator === "all_of") return `${verb} all of ${noun}`;
  if (group.operator === "any_of") return `${verb} one of ${noun}`;
  return `${verb} any ${group.minimumCount ?? 1} of ${noun}`;
}
