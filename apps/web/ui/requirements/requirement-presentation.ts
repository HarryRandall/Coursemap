import type { Course } from "@/lib/coursemap/types";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type {
  RequirementTreeCondition,
  RequirementTreeGroup,
  RequirementTreeNode,
  RequirementTreeOption,
} from "@/lib/coursemap/requirement-tree-node";
import type { RequirementTreeProgress } from "@/lib/coursemap/requirement-progress";

export type {
  RequirementTreeCondition,
  RequirementTreeGroup,
  RequirementTreeNode,
  RequirementTreeOption,
};

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

/** The catalogue code a course, incompatible or structure condition names. */
export function conditionItemCode(condition: RequirementTreeCondition) {
  return condition.itemCode ?? condition.options[0]?.code ?? null;
}

function conditionText(condition: RequirementTreeCondition) {
  return condition.freeText ?? condition.sourceText ?? null;
}

/**
 * How a condition should read. A cap on where units may come from is not
 * something to complete, and an incompatibility is a warning rather than a
 * rule to work towards, so neither may be drawn as progress.
 */
export type ConditionTone = "requirement" | "limit" | "warning" | "note";

export function conditionTone(
  condition: RequirementTreeCondition,
): ConditionTone {
  if (condition.conditionKind === "incompatible") return "warning";
  if (
    condition.conditionKind === "permission" ||
    condition.conditionKind === "other"
  ) {
    return "note";
  }
  if (condition.minimumUnits === null && condition.maximumUnits !== null) {
    return "limit";
  }
  return "requirement";
}

/** A short title for a condition. Never the stored condition kind itself. */
export function conditionHeading(condition: RequirementTreeCondition) {
  const courseCount = condition.options.filter(
    (option) => option.kind === "course",
  ).length;
  switch (condition.conditionKind) {
    case "course":
      return "Required course";
    case "incompatible":
      return "Cannot be counted together";
    case "structure":
      return "Enrolment requirement";
    case "structure_set":
      return condition.minimumCourses === 1
        ? "Choose an academic structure"
        : "Academic structure options";
    case "course_set_units":
      return condition.minimumCourses !== null &&
        condition.minimumCourses >= courseCount
        ? courseCount === 1
          ? "Compulsory course"
          : "Compulsory courses"
        : "Course options";
    case "units_total":
      return "Total units";
    case "subject_units":
      return condition.subjectCode
        ? `${condition.subjectCode} courses`
        : "Subject area courses";
    case "level_units":
      return conditionTone(condition) === "limit"
        ? "Course level limit"
        : "Course level";
    case "tagged_units":
      return condition.tag ?? "Tagged courses";
    case "elective_units":
      return "Elective courses";
    case "year_standing":
      return "Year standing";
    case "gpa":
      return "Grade point average";
    case "wam":
      return "Weighted average mark";
    case "permission":
      return "Permission required";
    default:
      return "Additional requirement";
  }
}

export function conditionInterpretation(condition: RequirementTreeCondition) {
  const parts: string[] = [];
  const code = conditionItemCode(condition);
  if (condition.conditionKind === "units_total") {
    const units = unitsDescription(
      condition.minimumUnits,
      condition.maximumUnits,
    );
    if (units) parts.push(units);
  } else if (condition.conditionKind === "course") {
    if (code) {
      parts.push(
        condition.requirementMode === "completed_or_concurrent"
          ? `${code}, completed or taken at the same time`
          : code,
      );
    }
    if (condition.minimumMark != null) {
      parts.push(`A mark of at least ${condition.minimumMark}`);
    }
  } else if (condition.conditionKind === "incompatible") {
    const codes = [
      ...new Set([code, ...condition.options.map((option) => option.code)]),
    ].filter((value): value is string => Boolean(value));
    parts.push(
      codes.length
        ? `Cannot be counted with ${codes.join(", ")}`
        : (conditionText(condition) ?? "Cannot be counted together"),
    );
  } else if (condition.conditionKind === "structure") {
    parts.push(
      code
        ? `Enrolment in ${code}`
        : (conditionText(condition) ?? "Enrolment requirement"),
    );
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
  } else if (condition.conditionKind === "year_standing") {
    parts.push(
      condition.minimumYear != null
        ? `At least year ${condition.minimumYear} standing`
        : (conditionText(condition) ?? "Year standing"),
    );
  } else if (condition.conditionKind === "gpa") {
    parts.push(
      condition.minimumGpa != null
        ? `A grade point average of at least ${condition.minimumGpa}`
        : (conditionText(condition) ?? "Grade point average"),
    );
  } else if (condition.conditionKind === "wam") {
    parts.push(
      condition.minimumWam != null
        ? `A weighted average mark of at least ${condition.minimumWam}`
        : (conditionText(condition) ?? "Weighted average mark"),
    );
  } else if (conditionText(condition)) {
    // Permission, other, and anything the importer could not model keep their
    // own wording rather than being paraphrased.
    parts.push(conditionText(condition)!);
  }

  if (
    condition.conditionKind !== "units_total" &&
    condition.conditionKind !== "incompatible"
  ) {
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
  /**
   * The requirements workspace picks majors and minors through its own
   * chooser, so it leaves structure options out of the tree. Reading surfaces
   * with no chooser of their own opt in.
   */
  showStructureOptions?: boolean;
  /**
   * Off for readers with no plan behind the view, such as the administrator
   * preview and the published structure page, where a progress bar would
   * report nothing but zero.
   */
  showPlanProgress?: boolean;
};

const NO_PROGRESS: RequirementTreeProgress = new Map();
const NO_STATUSES: ReadonlyMap<string, "completed" | "planned" | "enrolled"> =
  new Map();
const NO_CODES: ReadonlySet<string> = new Set();

/**
 * The context for a surface that reads a requirement tree without a plan
 * behind it: the published structure page and the import preview. Progress
 * would report nothing but zero there, so it is left off rather than drawn.
 */
export function readingTreeContext({
  academicYear,
  courses = [],
  unitTarget = null,
}: {
  academicYear: number | null;
  courses?: Course[];
  unitTarget?: number | null;
}): TreeContext {
  return {
    catalogue: {
      academicYear,
      courses,
      terms: [],
      degrees: [],
      majors: [],
      structures: [],
      programmeRequirementsImported: true,
      structureRequirements: [],
    },
    attemptStatusByCode: NO_STATUSES,
    selectedStructureCodes: NO_CODES,
    progress: NO_PROGRESS,
    unitTarget,
    showStructureOptions: true,
    showPlanProgress: false,
  };
}
