"use client";
import { cn } from "@/lib/cn";
import { StartYearPicker } from "@/ui/profile/start-year-picker";

/**
 * The calendar years a degree runs, as dots on a line: years already reached
 * are filled and the last is marked as the finish. The first year is the
 * start year, and choosing another from it moves the whole timeline.
 */
export function StudyTimeline({
  firstYear,
  lastYear,
  currentYear,
  startYears,
  onStartYearChange,
}: {
  firstYear: number;
  lastYear: number;
  currentYear: number;
  /** The start years a student may choose. */
  startYears: readonly number[];
  onStartYearChange: (year: number) => void;
}) {
  const years = Array.from(
    { length: Math.max(lastYear - firstYear + 1, 1) },
    (_, index) => firstYear + index,
  );
  return (
    <ol
      aria-label={`Study years, ${firstYear} to ${lastYear}`}
      className="flex min-w-0"
    >
      {years.map((year, index) => {
        const reached = year <= currentYear;
        const last = index === years.length - 1;
        return (
          <li
            key={year}
            className={cn("min-w-0", last ? "shrink-0" : "flex-1")}
          >
            <div aria-hidden="true" className="flex items-center">
              <span
                className={cn(
                  "size-3 shrink-0 rounded-full",
                  reached
                    ? "bg-primary"
                    : "bg-card ring-2 ring-border ring-inset",
                  year === currentYear && "ring-4 ring-primary/25",
                )}
              />
              {last ? null : (
                <span
                  className={cn(
                    "h-0.5 flex-1",
                    year < currentYear ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
            {index === 0 ? (
              <div className="mt-2">
                <StartYearPicker
                  years={startYears}
                  value={year}
                  currentYear={currentYear}
                  onChange={onStartYearChange}
                />
              </div>
            ) : (
              <p className="mt-2 py-0.5 text-sm font-semibold text-foreground tabular-nums">
                {year}
              </p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {index === 0 ? "Started" : last ? "Finish" : `Year ${index + 1}`}
              {year === currentYear ? " · now" : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
