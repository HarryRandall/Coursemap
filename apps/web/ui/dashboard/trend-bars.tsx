"use client";

export type TrendBarPoint = { label: string; value: number };

/**
 * Column chart for a short series of averages.
 *
 * The value axis is clipped to the band the data actually occupies. A 0-100
 * axis would flatten five semesters of marks into five near-identical bars,
 * which is the one thing this chart exists to show.
 */
export function TrendBars({
  points,
  height = 72,
  format = (value: number) => String(Math.round(value)),
  unitLabel = "",
}: {
  points: readonly TrendBarPoint[];
  height?: number;
  format?: (value: number) => string;
  unitLabel?: string;
}) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const floor = Math.max(0, min - span * 0.6);
  const ceiling = max + span * 0.25;

  return (
    <div
      className="flex items-end gap-1.5"
      style={{ height }}
      role="img"
      aria-label={points
        .map((point) => `${point.label}: ${format(point.value)}${unitLabel}`)
        .join(", ")}
    >
      {points.map((point, index) => {
        const scale = (point.value - floor) / (ceiling - floor);
        const latest = index === points.length - 1;
        return (
          <div
            key={point.label}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            title={`${point.label}: ${format(point.value)}${unitLabel}`}
          >
            <div
              className="w-full rounded-md"
              style={{
                height: Math.max(6, scale * (height - 18)),
                background: latest
                  ? "var(--primary)"
                  : "color-mix(in oklab, var(--primary) 26%, transparent)",
              }}
            />
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">
              {point.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
