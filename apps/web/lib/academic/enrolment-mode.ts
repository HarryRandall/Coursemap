export const ENROLMENT_MODES = [
  "single_degree",
  "flexible_double_degree",
  "fixed_double_degree",
] as const;

export type EnrolmentMode = (typeof ENROLMENT_MODES)[number];

export function validEnrolmentMode(value: unknown): value is EnrolmentMode {
  return ENROLMENT_MODES.some((mode) => mode === value);
}

/**
 * The enrolment mode a programme implies. ANU publishes its Flexible Double
 * Degrees as programmes coded `…FDD`, and a fixed double degree as one
 * programme naming both awards ("Bachelor of … / Bachelor of …"). Anything
 * else is studied as a single degree.
 */
export function enrolmentModeForProgramme(programme: {
  code: string;
  name: string;
}): EnrolmentMode {
  if (
    /FDD$/iu.test(programme.code) ||
    /^flexible double degree\b/iu.test(programme.name)
  )
    return "flexible_double_degree";
  if (/\bbachelor\b[^/]*\/\s*bachelor\b/iu.test(programme.name))
    return "fixed_double_degree";
  return "single_degree";
}

export function enrolmentModeLabel(mode: EnrolmentMode) {
  return {
    single_degree: "Single degree",
    flexible_double_degree: "Flexible Double Degree",
    fixed_double_degree: "Fixed double degree",
  }[mode];
}

export function enrolmentModeConditionLabel({
  enrolmentMode,
  matchesEnrolmentMode,
}: {
  enrolmentMode?: EnrolmentMode | null;
  matchesEnrolmentMode?: boolean | null;
}) {
  if (
    !validEnrolmentMode(enrolmentMode) ||
    typeof matchesEnrolmentMode !== "boolean"
  )
    return "Choose an enrolment mode and whether it applies";
  return `${matchesEnrolmentMode ? "Enrolled in" : "Not enrolled in"} a ${enrolmentModeLabel(enrolmentMode)}`;
}
