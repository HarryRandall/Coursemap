import type { RequirementTreeCondition } from "./requirement-tree-node";
import { requirementCourseCodes } from "./requirement-titles";

export function requirementLevelFilter(
  minimum: number | null,
  maximum: number | null,
) {
  // Levels arrive as digits or as bounds such as 1000 and 3999.
  const digit = (value: number) =>
    value < 10 ? value : Math.floor(value / 1000);
  if (minimum !== null && maximum !== null)
    return digit(minimum) === digit(maximum)
      ? String(digit(minimum))
      : `${digit(minimum)}-${digit(maximum)}`;
  if (minimum !== null) return `${digit(minimum)}+`;
  if (maximum !== null) return `1-${digit(maximum)}`;
  return null;
}

export function boundedRequirement(rule: RequirementTreeCondition) {
  if (rule.includesAnyCourse || rule.conditionKind === "elective_units")
    return false;
  return (
    requirementCourseCodes(rule).length > 0 ||
    (rule.conditionKind === "tagged_units" && Boolean(rule.tag)) ||
    (["subject_units", "level_units"].includes(rule.conditionKind) &&
      Boolean(rule.subjectCode))
  );
}

export function requirementCourseParams(
  rule: RequirementTreeCondition,
  year: number,
) {
  const params = new URLSearchParams({ year: String(year) });
  const codes = requirementCourseCodes(rule);
  if (!rule.includesAnyCourse && codes.length)
    params.set("codes", codes.join(","));
  else {
    if (
      ["subject_units", "level_units"].includes(rule.conditionKind) &&
      rule.subjectCode
    )
      params.set("subject", rule.subjectCode);
    if (rule.conditionKind === "tagged_units" && rule.tag)
      params.set("tag", rule.tag);
    const level = requirementLevelFilter(rule.minimumLevel, rule.maximumLevel);
    if (level) params.set("level", level);
  }
  return params;
}
