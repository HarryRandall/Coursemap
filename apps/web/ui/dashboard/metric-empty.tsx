"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const GHOST_BARS = [0.45, 0.7, 0.55, 0.85, 0.65];

function GhostBars({ height }: { height: number }) {
  return (
    <div className="flex items-end gap-1.5" style={{ height }} aria-hidden>
      {GHOST_BARS.map((scale, index) => (
        <div
          key={index}
          className="flex-1 rounded-md border border-dashed border-border"
          style={{ height: scale * height }}
        />
      ))}
    </div>
  );
}

/**
 * Placeholder for a metric that has nothing to show yet.
 *
 * A new plan leaves most of the dashboard blank, and a tile reading "Estimate
 * unavailable" spends its whole footprint saying nothing. This keeps the tile's
 * shape — so the grid does not reflow once real data lands — and spends the
 * space on the single action that fills it.
 */
export function MetricEmpty({
  message,
  action,
  height = 56,
}: {
  message: string;
  action?: { label: string; href: string };
  height?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <GhostBars height={height} />
      <p className="text-[11px] leading-4 text-muted-foreground">{message}</p>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex w-fit items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          {action.label}
          <ArrowRight className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}
