"use client";

const GHOST_BARS = [0.45, 0.7, 0.55, 0.85, 0.65];

function GhostBars({ height }: { height: number }) {
  return (
    <div className="flex items-end gap-1.5" style={{ height }} aria-hidden>
      {GHOST_BARS.map((scale, index) => (
        <div
          key={index}
          className="flex-1 rounded-md bg-muted"
          style={{ height: scale * height }}
        />
      ))}
    </div>
  );
}

/**
 * Placeholder for a metric that has nothing to show yet.
 *
 * The card's headline already states the empty condition, so this only keeps
 * the tile's shape and the grid does not reflow once real data lands.
 */
export function MetricEmpty({ height = 56 }: { height?: number }) {
  return <GhostBars height={height} />;
}
