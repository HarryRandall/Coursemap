export const ENROLMENT_MODES = [
  "single_degree",
  "flexible_double_degree",
  "fixed_double_degree",
] as const;

export type EnrolmentMode = (typeof ENROLMENT_MODES)[number];

export function validEnrolmentMode(value: unknown): value is EnrolmentMode {
  return ENROLMENT_MODES.some((mode) => mode === value);
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
