import type { Course } from "@/lib/coursemap/types";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type {
  RequirementTreeCondition,
  RequirementTreeGroup,
  RequirementTreeNode,
  RequirementTreeOption,
} from "@/lib/coursemap/requirement-tree-node";
import {
  requirementNodeKey,
  type RequirementAllocation,
  type RequirementNodeProgress,
  type RequirementTreeProgress,
} from "@/lib/coursemap/requirement-progress";

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

function unitQuantity(minimum: number | null, maximum: number | null) {
  const figure = (units: number) =>
    units.toLocaleString("en-AU", { maximumFractionDigits: 2 });
  if (minimum !== null && maximum !== null) {
    return minimum === maximum
      ? formatUnits(minimum)
      : `${figure(minimum)} to ${formatUnits(maximum)}`;
  }
  if (minimum !== null) return formatUnits(minimum);
  if (maximum !== null) return `at most ${formatUnits(maximum)}`;
  return null;
}

function levelPhrase(minimumLevel: number | null, maximumLevel: number | null) {
  if (minimumLevel !== null && maximumLevel !== null) {
    return minimumLevel === maximumLevel
      ? `at ${minimumLevel} level`
      : `at ${minimumLevel} to ${maximumLevel} level`;
  }
  if (minimumLevel !== null) return `at ${minimumLevel} level or above`;
  if (maximumLevel !== null) return `at up to ${maximumLevel} level`;
  return null;
}

function sentence(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The whole requirement as one line that leads with how much is needed, for
 * places with room for a single line: a graph node, a checklist row.
 *
 * conditionHeading names the category ("COMP courses") and
 * conditionInterpretation carries the detail ("COMP coded courses · At least
 * 24 units"), which suits a card with a progress bar beside it. Set one above
 * the other in a small node, the category repeated itself and the figure a
 * student needs sat in the smallest, faintest text. Kinds whose
 * interpretation already reads as a sentence keep it.
 */
export function conditionSummary(condition: RequirementTreeCondition) {
  const quantity = unitQuantity(condition.minimumUnits, condition.maximumUnits);
  const levels = levelPhrase(condition.minimumLevel, condition.maximumLevel);
  const scoped = (subject: string) =>
    [quantity ? `${quantity} of` : null, subject, levels]
      .filter(Boolean)
      .join(" ");

  switch (condition.conditionKind) {
    case "units_total":
      return quantity ? sentence(`${quantity} in total`) : "Total units";
    case "subject_units":
      return sentence(
        scoped(
          condition.subjectCode
            ? `${condition.subjectCode} courses`
            : "courses in the subject area",
        ),
      );
    case "level_units":
      return sentence(scoped("courses"));
    case "tagged_units":
      return sentence(
        scoped(
          condition.tag ? `courses tagged ${condition.tag}` : "tagged courses",
        ),
      );
    case "elective_units":
      return sentence(scoped("elective courses"));
    case "course_set_units":
      if (condition.minimumCourses) {
        return `Complete ${condition.minimumCourses} of the listed courses`;
      }
      return quantity
        ? sentence(`${quantity} from the listed courses`)
        : "Complete from the listed courses";
    default:
      return conditionInterpretation(condition) || conditionHeading(condition);
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
  /**
   * Where each course in the plan counts, and how to move one. Present only
   * where a plan sits behind the view.
   */
  placement?: {
    allocation: RequirementAllocation;
    /** The parts a course may count towards, most specific first. */
    optionsFor: (
      courseCode: string,
    ) => Array<{ nodeKey: string; label: string }>;
    labelFor: (nodeKey: string) => string;
    onPlace: (courseCode: string, nodeKey: string | null) => void;
  };
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

/**
 * Whether a condition draws nothing: a total that only restates the unit
 * target already shown above the tree, or structure options on a surface
 * that picks structures through its own chooser.
 */
export function hidesCondition(
  condition: RequirementTreeCondition,
  context: TreeContext,
) {
  if (condition.conditionKind === "structure_set") {
    return !context.showStructureOptions;
  }
  return (
    condition.conditionKind === "units_total" &&
    condition.minimumUnits === context.unitTarget &&
    condition.maximumUnits === null
  );
}

/** Warnings and notes read as alerts rather than as rules to meet. */
export function isNotice(node: RequirementTreeNode) {
  if (node.type !== "condition") return false;
  const tone = conditionTone(node);
  return tone === "warning" || tone === "note";
}

/**
 * The listed courses a rule counts, and how many of them are completed or
 * planned. With a plan behind the view, a course counts here only if it was
 * allocated here; one this list shares with another rule may count there.
 */
export function listedCourseCounts(
  condition: RequirementTreeCondition,
  context: TreeContext,
) {
  const codes = [
    ...new Set(
      condition.options
        .filter((option) => option.kind === "course")
        .map((option) => option.code),
    ),
  ];
  const progress = context.progress.get(requirementNodeKey(condition));
  const countsHere = (code: string) =>
    !context.placement || Boolean(progress?.matchedCourseCodes.includes(code));
  const statusOf = (code: string) =>
    countsHere(code) ? context.attemptStatusByCode.get(code) : undefined;
  return {
    codes,
    required:
      condition.minimumCourses !== null &&
      condition.minimumCourses >= codes.length,
    done: codes.filter((code) => statusOf(code) === "completed").length,
    planned: codes.filter((code) =>
      ["planned", "enrolled"].includes(statusOf(code) ?? ""),
    ).length,
  };
}

/** How far a rule has come, as a count against what it asks for. */
export type RequirementFigure = {
  value: number;
  target: number;
  unit: "units" | "courses";
  /** The target is a cap rather than something to reach. */
  maximum?: boolean;
};

/**
 * Where a rule stands for the student, so the workspace can sort what still
 * needs courses from what is covered, and say which in words.
 */
export type RequirementRowStatus =
  | {
      kind: "todo" | "planned" | "complete" | "limit" | "over_limit";
      figure: RequirementFigure | null;
      label: string;
    }
  | { kind: "unmeasured" };

function statusFromCounts(
  completed: number,
  planned: number,
  figure: RequirementFigure,
  shortfall: (missing: number) => string,
): RequirementRowStatus {
  if (completed >= figure.target) {
    return { kind: "complete", figure, label: "Complete" };
  }
  if (completed + planned >= figure.target) {
    return { kind: "planned", figure, label: "Planned" };
  }
  return {
    kind: "todo",
    figure,
    label: shortfall(figure.target - completed - planned),
  };
}

function statusFromProgress(
  progress: RequirementNodeProgress | undefined,
): RequirementRowStatus {
  if (!progress || progress.state === "unmeasured")
    return { kind: "unmeasured" };
  const target = progress.targetUnits;
  if (target === null || target <= 0) return { kind: "unmeasured" };
  const used = progress.completedUnits + progress.plannedUnits;
  return statusFromCounts(
    progress.completedUnits,
    progress.plannedUnits,
    { value: used, target, unit: "units" },
    (missing) => `${formatUnits(missing)} to plan`,
  );
}

export function requirementRowStatus(
  node: RequirementTreeNode,
  context: TreeContext,
): RequirementRowStatus {
  const progress = context.progress.get(requirementNodeKey(node));
  if (node.type !== "condition") return statusFromProgress(progress);
  const tone = conditionTone(node);
  if (tone === "warning" || tone === "note") return { kind: "unmeasured" };
  if (tone === "limit") {
    const maximum = node.maximumUnits;
    if (!progress || progress.state === "unmeasured" || maximum === null) {
      return { kind: "limit", figure: null, label: "Limit" };
    }
    const used = progress.completedUnits + progress.plannedUnits;
    const figure = {
      value: used,
      target: maximum,
      unit: "units" as const,
      maximum: true,
    };
    return progress.state === "over_limit"
      ? { kind: "over_limit", figure, label: "Over the limit" }
      : {
          kind: "limit",
          figure,
          label: `${formatUnits(Math.max(0, maximum - used))} of room left`,
        };
  }
  const target = node.minimumCourses;
  if (
    target !== null &&
    target > 0 &&
    node.options.some((option) => option.kind === "course")
  ) {
    const { required, done, planned } = listedCourseCounts(node, context);
    return statusFromCounts(
      done,
      planned,
      { value: done + planned, target, unit: "courses" },
      (missing) =>
        `${missing} ${missing === 1 ? "course" : "courses"} to ${required ? "plan" : "choose"}`,
    );
  }
  return statusFromProgress(progress);
}
