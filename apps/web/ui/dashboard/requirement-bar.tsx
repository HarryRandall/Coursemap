"use client";

/**
 * Segmented progress for one requirement group — completed, then scheduled,
 * against the group's unit target.
 *
 * Colours come from tokens rather than the palette so the bar tracks light and
 * dark alongside the rest of the dashboard.
 */
export function RequirementBar({
  completedUnits,
  plannedUnits,
  targetUnits,
  height = 10,
}: {
  completedUnits: number;
  plannedUnits: number;
  targetUnits: number | null;
  height?: number;
}) {
  const scale = Math.max(targetUnits ?? 0, completedUnits + plannedUnits, 1);
  const width = (units: number) =>
    `${Math.min(100, (units / scale) * 100).toFixed(2)}%`;
  return (
    <span
      className="flex overflow-hidden rounded-sm bg-border"
      style={{ height }}
      aria-hidden="true"
    >
      <span
        className="h-full"
        style={{
          width: width(completedUnits),
          background: "var(--primary)",
        }}
      />
      <span
        className="h-full"
        style={{
          width: width(plannedUnits),
          background: "color-mix(in oklab, var(--primary) 45%, transparent)",
        }}
      />
    </span>
  );
}
