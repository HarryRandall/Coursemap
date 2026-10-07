/** The lowest to highest result on a 0 to 100 scale, with a tick at the median. */
export function ReviewRangeBar({
  max,
  median,
  min,
}: {
  max: number;
  median: number;
  min: number;
}) {
  return (
    <div className="flex h-16 flex-col justify-center gap-1.5">
      <span
        role="img"
        aria-label={`Ranged from ${min} to ${max}%, usually ${Math.round(median)}%`}
        className="relative h-2 rounded-full bg-muted"
      >
        <span
          className="absolute inset-y-0 rounded-full bg-primary/35"
          style={{ left: `${min}%`, width: `${max - min}%` }}
        />
        <span
          className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-primary"
          style={{ left: `${median}%` }}
        />
      </span>
      <span
        aria-hidden="true"
        className="relative h-4 text-[10px] text-muted-foreground tabular-nums"
      >
        <span className="absolute -translate-x-1/2" style={{ left: `${min}%` }}>
          {min}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${max}%` }}>
          {max}
        </span>
      </span>
    </div>
  );
}
