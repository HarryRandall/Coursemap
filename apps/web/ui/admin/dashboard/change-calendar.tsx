import { Hint } from "@/ui/common/hint";
import { shortDayLabel, weekStart } from "@/lib/admin/dashboard-series";

// Stepped shares of the primary colour; the first step is an empty day.
const STEPS = [0, 22, 45, 70, 100];
const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

function step(count: number, busiest: number) {
  if (count === 0) return 0;
  return Math.min(4, 1 + Math.floor((count / busiest) * 3.999));
}

function shade(index: number) {
  return index === 0
    ? "var(--color-muted)"
    : `color-mix(in oklab, var(--color-primary) ${STEPS[index]}%, var(--color-card))`;
}

/** Catalogue changes per day, one column per week, Monday at the top. */
export function ChangeCalendar({
  days,
}: {
  days: { day: string; count: number }[];
}) {
  const busiest = Math.max(1, ...days.map((entry) => entry.count));
  const total = days.reduce((sum, entry) => sum + entry.count, 0);
  const weeks = new Map<string, ({ day: string; count: number } | null)[]>();
  for (const entry of days) {
    const week = weekStart(entry.day);
    if (!weeks.has(week)) weeks.set(week, Array(7).fill(null));
    const weekday = (new Date(`${entry.day}T00:00:00Z`).getUTCDay() + 6) % 7;
    weeks.get(week)![weekday] = entry;
  }
  return (
    <figure className="space-y-3">
      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `1.75rem repeat(${weeks.size}, minmax(0, 1fr))`,
        }}
        role="img"
        aria-label={`${total} catalogue changes in the last ${days.length} days`}
      >
        {WEEKDAY_LABELS.map((label, weekday) => (
          <div key={`row-${weekday}`} className="contents">
            <span className="self-center text-[10px] text-muted-foreground">
              {label}
            </span>
            {[...weeks.values()].map((week, column) => {
              const entry = week[weekday];
              if (!entry) return <span key={column} />;
              return (
                <Hint
                  key={column}
                  label={`${shortDayLabel(entry.day)}: ${entry.count} ${entry.count === 1 ? "change" : "changes"}`}
                >
                  <span
                    className="aspect-square rounded-[3px]"
                    style={{
                      backgroundColor: shade(step(entry.count, busiest)),
                    }}
                  />
                </Hint>
              );
            })}
          </div>
        ))}
      </div>
      <figcaption className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{total} changes</span>
        <span className="flex items-center gap-1">
          Less
          {STEPS.map((_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="size-2.5 rounded-[2px]"
              style={{ backgroundColor: shade(index) }}
            />
          ))}
          More
        </span>
      </figcaption>
    </figure>
  );
}
