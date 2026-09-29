export const WORKLOAD_HOURS_BASES = ["weekly", "total"] as const;
export type WorkloadHoursBasis = (typeof WORKLOAD_HOURS_BASES)[number];

export function workloadHoursBasis(value: unknown): WorkloadHoursBasis | null {
  return value === "weekly" || value === "total" ? value : null;
}

/** Unqualified legacy figures cannot be presented as weekly hours or totals. */
export function workloadHoursLabel(hours: number | null, basis: unknown) {
  if (hours === null || !Number.isFinite(hours)) return null;
  if (basis === "weekly") return `${hours} hours per week`;
  if (basis === "total") return `${hours} hours in total`;
  return null;
}
