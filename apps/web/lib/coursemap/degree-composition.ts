import type {
  PlanRequirementNode,
  PlanStructureKind,
  PlanStructureRequirements,
} from "@/lib/coursemap/plan-catalogue";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";
import type { Attempt, Profile } from "@/lib/coursemap/types";
import {
  creditedAttempts,
  requirementNodeMatcher,
  requirementTargetUnits,
} from "@/lib/coursemap/requirement-progress";
import type { PlanningCatalogue } from "@/lib/planner";

/** Most ANU courses are worth 6 units, so empty space is shown in 6-unit slots. */
export const COMPOSITION_SLOT_UNITS = 6;

export type CompositionKind = "core" | "major" | "minor" | "electives";

export type CompositionCourse = {
  code: string;
  name: string;
  units: number;
  status: "completed" | "planned";
};

export type CompositionSection = {
  key: string;
  kind: CompositionKind;
  /** The chosen major or minor, when the section belongs to one. */
  structureName: string | null;
  /** Units the section occupies in the degree, or null when unknown. */
  targetUnits: number | null;
  /** True when the section is an invitation to choose a major or minor. */
  unchosen: boolean;
  courses: CompositionCourse[];
};

type Matcher = NonNullable<ReturnType<typeof requirementNodeMatcher>>;

function structureKindsWithin(node: PlanRequirementNode): PlanStructureKind[] {
  if (node.type === "group") return node.children.flatMap(structureKindsWithin);
  const kind = node.structureKind;
  return kind === "major" || kind === "minor" ? [kind] : [];
}

/**
 * Reads the programme's top-level rules: course rules become the programme
 * core, and rules that ask for a major or minor state how many units to reserve
 * for one before it is chosen.
 */
function programmeShape(root: PlanRequirementNode | null) {
  const core = { targetUnits: 0, matchers: [] as Matcher[] };
  const reserved: Partial<Record<"major" | "minor", number>> = {};
  const children = root?.type === "group" ? root.children : [];
  children.forEach((node) => {
    const kinds = structureKindsWithin(node);
    if (kinds.length > 0) {
      const units = requirementTargetUnits(node);
      if (units !== null) reserved[kinds[0] as "major" | "minor"] = units;
      return;
    }
    const matcher = requirementNodeMatcher(node);
    if (!matcher) return;
    core.matchers.push(matcher);
    core.targetUnits += requirementTargetUnits(node) ?? 0;
  });
  return { core, reserved };
}

/**
 * How the student's degree divides into programme core, major, minors and
 * electives, with each plan course placed in the first section it counts
 * toward that still has room. Courses that fit nowhere else, or overflow a
 * full section, fall to electives, as they do in an ANU degree.
 *
 * Like the requirements panel, this is an indicative reading of published
 * rules rather than a formal audit.
 */
export function degreeComposition({
  degreeUnits,
  profile,
  programme,
  structureOptions,
  requirements,
  attempts,
  catalogue,
}: {
  degreeUnits: number | null;
  profile: Pick<Profile, "degreeCode" | "majorCode" | "minorCodes">;
  /** The programme's offered majors and minors, when known. */
  programme: Pick<ProgrammeOption, "majorCodes" | "minorCodes"> | null;
  /** Majors and minors for the plan's year, for names and unit sizes. */
  structureOptions: readonly Pick<ProgrammeOption, "code" | "name" | "units">[];
  requirements: readonly PlanStructureRequirements[];
  attempts: readonly Attempt[];
  catalogue: PlanningCatalogue;
}): CompositionSection[] {
  const requirementsFor = (code: string, kind: PlanStructureKind) =>
    requirements.find(
      (item) => item.structureCode === code && item.structureKind === kind,
    )?.root ?? null;
  const { core, reserved } = programmeShape(
    requirementsFor(profile.degreeCode, "programme"),
  );

  const sections: CompositionSection[] = [];
  const matchers = new Map<string, Matcher>();
  const add = (
    section: Omit<CompositionSection, "courses">,
    matches: Matcher | null,
  ) => {
    sections.push({ ...section, courses: [] });
    if (matches) matchers.set(section.key, matches);
  };

  if (core.matchers.length > 0) {
    add(
      {
        key: "core",
        kind: "core",
        structureName: null,
        targetUnits: core.targetUnits || null,
        unchosen: false,
      },
      (course) => core.matchers.some((matches) => matches(course)),
    );
  }

  const chosen = (kind: "major" | "minor", code: string, index: number) => {
    const option = structureOptions.find((item) => item.code === code);
    const root = requirementsFor(code, kind);
    add(
      {
        key: `${kind}-${code}`,
        kind,
        structureName: option?.name ?? code,
        // A second minor cannot borrow the first one's programme reservation.
        targetUnits:
          option?.units ??
          (root ? requirementTargetUnits(root) : null) ??
          (index === 0 ? (reserved[kind] ?? null) : null),
        unchosen: false,
      },
      root ? requirementNodeMatcher(root) : null,
    );
  };
  const invitation = (kind: "major" | "minor") => {
    const offered =
      kind === "major" ? programme?.majorCodes : programme?.minorCodes;
    if (reserved[kind] === undefined && !offered?.length) return;
    add(
      {
        key: `${kind}-unchosen`,
        kind,
        structureName: null,
        targetUnits: reserved[kind] ?? null,
        unchosen: true,
      },
      null,
    );
  };

  if (profile.majorCode) chosen("major", profile.majorCode, 0);
  else invitation("major");
  if (profile.minorCodes.length > 0) {
    profile.minorCodes.forEach((code, index) => chosen("minor", code, index));
  } else {
    invitation("minor");
  }

  // Only a minor the programme requires takes units from electives before it
  // is chosen; an optional one is offered without reserving space.
  const allocated = sections.reduce(
    (total, section) =>
      section.kind === "minor" &&
      section.unchosen &&
      reserved.minor === undefined
        ? total
        : total + (section.targetUnits ?? 0),
    0,
  );
  const electives: CompositionSection = {
    key: "electives",
    kind: "electives",
    structureName: null,
    targetUnits:
      degreeUnits === null ? null : Math.max(0, degreeUnits - allocated),
    unchosen: false,
    courses: [],
  };

  // Completed courses claim space first so planned ones overflow instead.
  const credited = creditedAttempts(attempts, catalogue).sort(
    (a, b) =>
      Number(b.attempt.status === "completed") -
        Number(a.attempt.status === "completed") ||
      a.course.code.localeCompare(b.course.code),
  );
  const used = new Map<string, number>();
  credited.forEach(({ attempt, course, units }) => {
    const home =
      sections.find((section) => {
        if (!matchers.get(section.key)?.(course)) return false;
        const target = section.targetUnits;
        return (
          target === null || (used.get(section.key) ?? 0) + units <= target
        );
      }) ?? electives;
    used.set(home.key, (used.get(home.key) ?? 0) + units);
    home.courses.push({
      code: course.code,
      name: course.name,
      units,
      status: attempt.status === "completed" ? "completed" : "planned",
    });
  });

  const showElectives =
    (electives.targetUnits ?? 0) > 0 || electives.courses.length > 0;
  return showElectives ? [...sections, electives] : sections;
}

/** Units a section shows: its target, or what the plan puts there if larger. */
export function compositionSectionUnits(section: CompositionSection) {
  const mapped = section.courses.reduce((total, item) => total + item.units, 0);
  return Math.max(section.targetUnits ?? 0, mapped);
}
