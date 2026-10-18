import type { RequirementTreeCondition } from "./requirement-tree-node";
import type { Course } from "./types";

export function requirementCourseCodes(rule: RequirementTreeCondition) {
  return [
    ...new Set(
      rule.options
        .filter((option) => option.kind === "course")
        .map((option) => option.code),
    ),
  ];
}

export function requirementCourseCount(
  rule: RequirementTreeCondition,
  courses: readonly Course[] = [],
) {
  const codes = requirementCourseCodes(rule);
  if (codes.length === 0 || rule.includesAnyCourse) return null;
  if (rule.minimumCourses !== null && rule.minimumCourses >= codes.length)
    return rule.minimumCourses;
  // A repeatable course contributes up to its allowance rather than its units.
  const repeatUnits = new Map(
    rule.options.flatMap((option) =>
      option.kind === "course" && option.maximumUnits != null
        ? [[option.code, option.maximumUnits] as const]
        : [],
    ),
  );
  const units = codes.map((code) => {
    const repeat = repeatUnits.get(code);
    if (repeat !== undefined) return repeat;
    const course = courses.find((candidate) => candidate.code === code);
    return course?.unitValue?.kind === "fixed" ? course.unitValue.units : null;
  });
  const allFixed = units.every((value) => value !== null && value > 0);
  if (
    allFixed &&
    rule.minimumUnits ===
      units.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  )
    return codes.length;
  if (rule.minimumCourses !== null && rule.minimumCourses > 0)
    return rule.minimumCourses;
  // A course that may repeat can fill several slots, so units imply no count.
  if (!allFixed || repeatUnits.size > 0) return null;
  const shared = units[0];
  if (
    shared &&
    units.every((value) => value === shared) &&
    rule.minimumUnits !== null
  ) {
    const count = rule.minimumUnits / shared;
    if (Number.isInteger(count) && count > 0) return count;
  }
  return null;
}

function joined(codes: string[], conjunction: string) {
  return codes.length === 1
    ? codes[0]
    : `${codes.slice(0, -1).join(", ")} ${conjunction} ${codes.at(-1)}`;
}

/** Returns null for notices and academic conditions that retain their own wording. */
export function requirementTitle(
  rule: RequirementTreeCondition,
  courses: readonly Course[] = [],
): string | null {
  const codes = requirementCourseCodes(rule);
  if (rule.includesAnyCourse) return "Electives";
  if (
    ["course", "course_set_units"].includes(rule.conditionKind) &&
    codes.length
  ) {
    const count =
      rule.conditionKind === "course"
        ? codes.length
        : requirementCourseCount(rule, courses);
    if (
      count !== null &&
      (count === codes.length ||
        (rule.minimumCourses !== null && rule.minimumCourses >= codes.length))
    )
      return codes.length <= 3
        ? `Take ${joined(codes, "and")}`
        : `Take all ${codes.length} core courses`;
    if (count === 1)
      return codes.length <= 3
        ? `Pick one: ${joined(codes, "or")}`
        : `Pick one of ${codes.length} courses`;
    if (count !== null) return `Pick ${count} of ${codes.length} courses`;
    // A list of one course is named, since "from 1 courses" reads as a slip.
    const listed = codes.length === 1 ? codes[0] : `${codes.length} courses`;
    if (rule.minimumUnits !== null && rule.minimumUnits > 0)
      return `Pick ${rule.minimumUnits} units from ${listed}`;
    if (rule.maximumUnits !== null)
      return `Pick up to ${rule.maximumUnits} units from ${listed}`;
    return `Pick from ${listed}`;
  }
  const quantity =
    rule.minimumUnits && rule.minimumUnits > 0
      ? rule.maximumUnits !== null && rule.maximumUnits !== rule.minimumUnits
        ? `${rule.minimumUnits} to ${rule.maximumUnits} units`
        : `${rule.minimumUnits} units`
      : rule.maximumUnits !== null
        ? `Up to ${rule.maximumUnits} units`
        : null;
  const normalise = (value: number) => (value < 10 ? value * 1000 : value);
  const minimum =
    rule.minimumLevel === null ? null : normalise(rule.minimumLevel);
  const maximum =
    rule.maximumLevel === null ? null : normalise(rule.maximumLevel);
  const levels =
    minimum !== null && maximum !== null
      ? minimum === maximum
        ? `at ${minimum} level`
        : `at ${minimum} to ${maximum} level`
      : minimum !== null
        ? `at ${minimum} level or above`
        : maximum !== null
          ? `at up to ${maximum} level`
          : null;
  switch (rule.conditionKind) {
    case "elective_units":
      return "Electives";
    case "tagged_units":
      return [
        quantity,
        rule.tag ? `tagged ${rule.tag}` : "tagged courses",
        levels,
      ]
        .filter(Boolean)
        .join(" ");
    case "subject_units":
      return [
        quantity,
        rule.subjectCode
          ? `${quantity ? "from " : ""}${rule.subjectCode} courses`
          : "from subject area courses",
        levels,
      ]
        .filter(Boolean)
        .join(" ");
    case "level_units":
      return [
        quantity,
        rule.subjectCode
          ? `${quantity ? "from " : ""}${rule.subjectCode} courses`
          : quantity
            ? null
            : "Courses",
        levels,
      ]
        .filter(Boolean)
        .join(" ");
    case "units_total":
      return quantity ? `${quantity} in total` : "Total units";
    default:
      return null;
  }
}
