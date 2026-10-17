export const PROGRAMME_CAREERS = [
  "undergraduate",
  "postgraduate",
  "research",
  "non_award",
] as const;

export type ProgrammeCareer = (typeof PROGRAMME_CAREERS)[number];

/** The academic career of a programme on a student's plan, when published. */
export type ProgrammeCareerRecord = {
  code: string;
  career: ProgrammeCareer | null;
};

export function validProgrammeCareer(value: unknown): value is ProgrammeCareer {
  return PROGRAMME_CAREERS.some((career) => career === value);
}

/**
 * Reads the academic career ANU prints on a programme page. Unrecognised
 * wording stays unknown rather than defaulting to a career.
 */
export function programmeCareerFromAcademicCareer(
  value: string | null | undefined,
): ProgrammeCareer | null {
  const key = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, " ");
  if (!key) return null;
  if (key === "undergraduate" || key === "ugrd") return "undergraduate";
  if (key === "postgraduate" || key === "pgrd") return "postgraduate";
  if (
    key === "research" ||
    key === "rsch" ||
    key === "higher degree by research"
  )
    return "research";
  if (key === "non award" || key === "non award study") return "non_award";
  return null;
}

/**
 * Whether one career satisfies a required career. ANU's "postgraduate" or
 * "graduate program" wording covers coursework and research degrees alike,
 * while "research" is limited to higher degrees by research.
 */
function careerIncludes(required: ProgrammeCareer, actual: ProgrammeCareer) {
  return (
    actual === required ||
    (required === "postgraduate" && actual === "research")
  );
}

/**
 * Unknown when no programme on the plan is in the career and at least one has
 * no published career.
 */
export function careerEnrolmentStatus(
  required: ProgrammeCareer,
  matches: boolean,
  programmeCodes: readonly string[],
  programmeCareers: readonly ProgrammeCareerRecord[] = [],
): "met" | "unmet" | "unknown" {
  if (programmeCodes.length === 0) return "unknown";
  let isMissing = false;
  for (const code of programmeCodes) {
    const recorded = new Set(
      programmeCareers
        .filter(
          (programme) => programme.code.toUpperCase() === code.toUpperCase(),
        )
        .map((programme) => programme.career),
    );
    // Different year snapshots must not silently choose a career.
    if (recorded.size !== 1 || recorded.has(null)) {
      isMissing = true;
      continue;
    }
    // One programme in the career settles the rule either way.
    if (careerIncludes(required, [...recorded][0]!))
      return matches ? "met" : "unmet";
  }
  if (isMissing) return "unknown";
  return matches ? "unmet" : "met";
}

export function programmeCareerLabel(career: ProgrammeCareer) {
  return {
    undergraduate: "an undergraduate program",
    postgraduate: "a postgraduate program",
    research: "a higher degree by research",
    non_award: "non-award study",
  }[career];
}

export function careerConditionLabel({
  career,
  matchesCareer,
}: {
  career?: ProgrammeCareer | null;
  matchesCareer?: boolean | null;
}) {
  if (!validProgrammeCareer(career) || typeof matchesCareer !== "boolean")
    return "Choose a career and whether it applies";
  return `${matchesCareer ? "Be enrolled in" : "Not be enrolled in"} ${programmeCareerLabel(career)}`;
}
