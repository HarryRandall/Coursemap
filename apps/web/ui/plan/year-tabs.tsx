"use client";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type YearTab = {
  /** The calendar year, or "later" for courses not scheduled yet. */
  key: string;
  label: string;
  detail: string;
  units: number;
  target: number;
  /** Every course in the year is recorded as completed. */
  finished: boolean;
};

/**
 * The plan's years as tabs with their progress. Dragging a course over a tab
 * opens that year, so a course can move between years in one drag.
 */
export function YearTabs({
  years,
  selectedKey,
  onSelect,
}: {
  years: YearTab[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Years"
      className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2"
    >
      {years.map((year) => {
        const selected = year.key === selectedKey;
        return (
          <button
            key={year.key}
            type="button"
            role="tab"
            aria-selected={selected}
            data-year-tab={year.key}
            onClick={() => onSelect(year.key)}
            className={cn(
              "flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl px-3 py-2.5 text-left ring-1 transition",
              selected
                ? "bg-card ring-2 ring-primary"
                : year.finished
                  ? "ring-border hover:bg-muted/50"
                  : "bg-card ring-border hover:bg-muted/50",
            )}
          >
            <span className="flex items-baseline gap-1.5 truncate">
              <span className="text-[13px] font-semibold text-foreground">
                {year.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {year.detail}
              </span>
            </span>
            {year.finished ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                <CheckCircle2 size={12} aria-hidden="true" />
                Done
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {year.target > 0
                  ? `${year.units} / ${year.target} units`
                  : `${year.units} units`}
              </span>
            )}
            <span
              aria-hidden="true"
              className="h-1 overflow-hidden rounded-full bg-muted"
            >
              <span
                className={cn(
                  "block h-full",
                  year.finished ? "bg-success" : "bg-primary",
                )}
                style={{
                  width: `${year.target > 0 ? Math.min(100, (year.units / year.target) * 100) : 0}%`,
                }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
