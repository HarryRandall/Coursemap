import type { Course } from "@/lib/coursemap/types";
import type {
  PlanCatalogue,
  PlanRequirementCondition,
} from "@/lib/coursemap/plan-catalogue";
import type { RequirementTreeProgress } from "@/lib/coursemap/requirement-progress";

export function formatUnits(units: number) {
  return `${units.toLocaleString("en-AU", { maximumFractionDigits: 2 })} units`;
}
export function unitsDescription(
  minimum: number | null,
  maximum: number | null,
) {
  if (minimum !== null && maximum !== null && minimum === maximum) {
    return formatUnits(minimum);
  }
  if (minimum !== null && maximum !== null) {
    return `${formatUnits(minimum)} to ${formatUnits(maximum)}`;
  }
  if (minimum !== null) return `At least ${formatUnits(minimum)}`;
  if (maximum !== null) return `Up to ${formatUnits(maximum)}`;
  return null;
}
export function levelCourseDescription(
  minimumLevel: number | null,
  maximumLevel: number | null,
) {
  if (minimumLevel !== null && maximumLevel !== null) {
    return minimumLevel === maximumLevel
      ? `${minimumLevel} level courses`
      : `${minimumLevel} to ${maximumLevel} level courses`;
  }
  if (minimumLevel !== null) return `${minimumLevel} level courses or above`;
  if (maximumLevel !== null) return `Courses up to ${maximumLevel} level`;
  return null;
}

export function conditionInterpretation(condition: PlanRequirementCondition) {
  const parts: string[] = [];
  if (condition.conditionKind === "units_total") {
    const units = unitsDescription(
      condition.minimumUnits,
      condition.maximumUnits,
    );
    if (units) parts.push(units);
  } else if (condition.conditionKind === "course_set_units") {
    parts.push(
      condition.minimumCourses
        ? `Complete at least ${condition.minimumCourses} listed course${condition.minimumCourses === 1 ? "" : "s"}`
        : "Complete from the listed courses",
    );
  } else if (condition.conditionKind === "structure_set") {
    parts.push(
      condition.minimumCourses
        ? `Complete at least ${condition.minimumCourses} listed academic structure${condition.minimumCourses === 1 ? "" : "s"}`
        : "Complete from the listed academic structures",
    );
  } else if (
    condition.conditionKind === "subject_units" &&
    condition.subjectCode
  ) {
    const levels = levelCourseDescription(
      condition.minimumLevel,
      condition.maximumLevel,
    );
    parts.push(
      levels
        ? `${condition.subjectCode} ${levels.toLowerCase()}`
        : `${condition.subjectCode} coded courses`,
    );
  } else if (condition.conditionKind === "level_units") {
    const levels = levelCourseDescription(
      condition.minimumLevel,
      condition.maximumLevel,
    );
    if (levels) parts.push(levels);
  } else if (condition.conditionKind === "tagged_units" && condition.tag) {
    parts.push(condition.tag);
  } else if (condition.conditionKind === "elective_units") {
    parts.push("Unrestricted elective courses");
  } else if (condition.freeText) {
    parts.push(condition.freeText);
  }

  if (condition.conditionKind !== "units_total") {
    const units = unitsDescription(
      condition.minimumUnits,
      condition.maximumUnits,
    );
    if (units) parts.push(units);
  }
  return parts.join(" · ");
}
export type TreeContext = {
  catalogue: PlanCatalogue;
  attemptStatusByCode: ReadonlyMap<
    string,
    "completed" | "planned" | "enrolled"
  >;
  selectedStructureCodes: ReadonlySet<string>;
  progress: RequirementTreeProgress;
  unitTarget?: number | null;
  onAddCourse?: (course: Course) => void;
};
