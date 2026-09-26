"use client";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Term } from "@/lib/coursemap/types";
import { STANDARD_TERM_UNITS } from "@/lib/planner";

export type TermSummary = {
  units: number;
  courses: number;
  /** Every course in the semester is recorded as completed. */
  finished: boolean;
};

/**
 * Every semester in the plan as a tile to open, and to drop a course on to
 * move it there. Finished semesters say so rather than repeating their load.
 */
export function SemesterStrip({
  terms,
  commencementYear,
  selectedId,
  dropTargetId,
  summaryFor,
  onSelect,
}: {
  terms: Term[];
  commencementYear: number;
  selectedId: string;
  dropTargetId: string | null;
  summaryFor: (term: Term) => TermSummary;
  onSelect: (term: Term) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Semesters"
      className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2"
    >
      {terms.map((term) => {
        const summary = summaryFor(term);
        const later = term.id === "unscheduled";
        const selected = term.id === selectedId;
        return (
          <button
            key={term.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-drop-term={term.id}
            onClick={() => onSelect(term)}
            className={cn(
              "flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg bg-card px-2.5 py-2 text-left ring-1 transition",
              selected
                ? "ring-2 ring-primary"
                : dropTargetId === term.id
                  ? "bg-primary/10 ring-2 ring-primary/40"
                  : "ring-border hover:bg-muted/50",
              summary.finished && !selected && "bg-transparent",
            )}
          >
            <span className="truncate text-[11px] text-muted-foreground">
              {later
                ? "Not scheduled"
                : `Year ${Math.max(1, term.year - commencementYear + 1)}`}
            </span>
            <span className="truncate text-xs font-semibold text-foreground">
              {later ? "Later" : term.shortName}
            </span>
            {summary.finished ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                <CheckCircle2 size={12} aria-hidden="true" />
                Done
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {later
                  ? `${summary.courses} ${summary.courses === 1 ? "course" : "courses"}`
                  : `${summary.units} / ${STANDARD_TERM_UNITS} units`}
              </span>
            )}
            <span
              aria-hidden="true"
              className="h-0.5 overflow-hidden rounded-full bg-muted"
            >
              <span
                className={cn(
                  "block h-full",
                  summary.finished ? "bg-success" : "bg-primary",
                )}
                style={{
                  width: `${Math.min(100, (summary.units / STANDARD_TERM_UNITS) * 100)}%`,
                }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
