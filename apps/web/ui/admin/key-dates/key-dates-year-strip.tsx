"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { KeyDatesYearSummary } from "@/lib/admin/key-dates";

function yearStatus(summary: KeyDatesYearSummary) {
  if (summary.hasPendingReview)
    return { label: "Ready to review", dot: "bg-primary" };
  if (summary.publishedCount > 0)
    return {
      label: `${summary.publishedCount} dates`,
      dot: "bg-emerald-500",
    };
  return { label: "Not synced", dot: "bg-muted-foreground/30" };
}

/**
 * Every calendar year with its state, so the year that needs attention is
 * visible without opening each one. Oldest on the left, like a timeline.
 */
export function KeyDatesYearStrip({
  selectedYear,
  years,
}: {
  selectedYear: number;
  years: KeyDatesYearSummary[];
}) {
  const ordered = [...years].sort((a, b) => a.year - b.year);
  const selectedLink = useRef<HTMLAnchorElement>(null);

  // The strip scrolls sideways, so a year late in the range can open hidden.
  useEffect(() => {
    selectedLink.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
  }, [selectedYear]);

  return (
    <nav
      aria-label="Calendar years"
      className="-mx-1 overflow-x-auto px-1 pb-1"
    >
      <ol className="flex min-w-max gap-2">
        {ordered.map((summary) => {
          const status = yearStatus(summary);
          const selected = summary.year === selectedYear;
          return (
            <li key={summary.year}>
              <Link
                ref={selected ? selectedLink : undefined}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex w-36 flex-col gap-1.5 rounded-xl border px-3.5 py-3 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                  selected
                    ? "border-primary/50 bg-primary/5 shadow-xs"
                    : "border-border bg-card hover:border-input hover:bg-accent/40",
                )}
                href={`/admin/key-dates/${summary.year}`}
                scroll={false}
              >
                <span
                  className={cn(
                    "text-lg leading-none font-semibold tracking-tight tabular-nums",
                    selected && "text-primary",
                  )}
                >
                  {summary.year}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className={cn("size-1.5 shrink-0 rounded-full", status.dot)}
                  />
                  <span className="truncate">{status.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
