"use client";

export type GradeBarPoint = { code: string; label: string; count: number };

/**
 * Grade mix across completed courses. Counts start at zero, so unlike the mark
 * trend this axis is absolute — an empty band should read as empty.
 */
export function GradeBars({
  points,
  height = 72,
}: {
  points: readonly GradeBarPoint[];
  height?: number;
}) {
  const max = Math.max(...points.map((point) => point.count), 1);
  return (
    <div
      className="flex items-end gap-2"
      style={{ height }}
      role="img"
      aria-label={points
        .map((point) => `${point.label}: ${point.count}`)
        .join(", ")}
    >
      {points.map((point) => (
        <div
          key={point.code}
          className="flex min-w-0 flex-1 flex-col items-center gap-1"
          title={`${point.label}: ${point.count}`}
        >
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {point.count || ""}
          </span>
          <div
            className="w-full rounded-md"
            style={{
              height: Math.max(2, (point.count / max) * (height - 28)),
              background: point.count
                ? "color-mix(in oklab, var(--primary) 45%, transparent)"
                : "color-mix(in oklab, var(--foreground) 8%, transparent)",
            }}
          />
          <span className="text-[10px] font-medium text-muted-foreground">
            {point.code}
          </span>
        </div>
      ))}
    </div>
  );
}
