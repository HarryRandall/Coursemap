import { cn } from "@/lib/cn";

export type UnitsCompositionSegment = {
  key: string;
  title: string;
  units: number;
  /** Background class for the segment and its legend dot. */
  fill: string;
};

function unitsLabel(units: number) {
  return `${units.toLocaleString("en-AU", { maximumFractionDigits: 2 })} units`;
}

/**
 * How a unit total divides between named parts: a stacked bar with a legend
 * naming each share, so the colour never carries the meaning alone. Without
 * a total the legend stands on its own, since a bar would misstate the
 * shares. Whatever the parts leave of the total stays as bare track and is
 * named by `spare`.
 */
export function UnitsComposition({
  segments,
  total,
  spare = null,
  label,
  className,
}: {
  segments: readonly UnitsCompositionSegment[];
  /** Units the whole bar stands for, or null to show the legend alone. */
  total: number | null;
  spare?: { title: string; units: number } | null;
  /** The bar's accessible name. */
  label: string;
  className?: string;
}) {
  if (segments.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {total !== null && total > 0 ? (
        <div
          role="img"
          aria-label={label}
          className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-muted"
        >
          {segments.map((segment) => (
            <span
              key={segment.key}
              className={cn("block h-full", segment.fill)}
              style={{ width: `${(segment.units / total) * 100}%` }}
            />
          ))}
        </div>
      ) : null}
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", segment.fill)}
            />
            <span className="text-foreground">{segment.title}</span>
            <span className="text-muted-foreground tabular-nums">
              {unitsLabel(segment.units)}
            </span>
          </li>
        ))}
        {spare && spare.units > 0 ? (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-muted ring-1 ring-border ring-inset"
            />
            <span className="text-foreground">{spare.title}</span>
            <span className="text-muted-foreground tabular-nums">
              {unitsLabel(spare.units)}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
