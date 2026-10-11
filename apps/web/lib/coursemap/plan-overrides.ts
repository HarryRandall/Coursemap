import type {
  OverrideReason,
  PlanOverride,
  RequirementOverride,
} from "./types";

export const OVERRIDE_REASONS: Record<OverrideReason, string> = {
  approval: "I have permission or approval",
  credit: "I have credit or an exemption",
  data_error: "Coursemap's data is wrong",
  other: "Something else",
};

export function validPlanOverride(value: unknown): value is PlanOverride {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.reason === "string" &&
    Object.hasOwn(OVERRIDE_REASONS, candidate.reason) &&
    (candidate.note === undefined ||
      (typeof candidate.note === "string" && candidate.note.length <= 500))
  );
}

export function validCreditedUnits(
  value: unknown,
): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= 2147483647)
  );
}

export function requirementOverrideFor(
  overrides: readonly RequirementOverride[],
  structureCode: string,
  requirementKey: string,
) {
  return overrides.find(
    (item) =>
      item.structureCode === structureCode &&
      item.requirementKey === requirementKey,
  );
}
