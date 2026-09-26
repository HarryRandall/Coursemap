"use client";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Circle,
  LockKeyhole,
  Plus,
} from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Hint } from "@/ui/common/hint";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import type { ReactNode } from "react";

/**
 * One course a rule lists, as a compact row: its status, code and name, and
 * where it counts or a way to add it. Courses without a published page read
 * as plain text rather than linking to nothing.
 */
export function RequirementCourseRow({
  code,
  course,
  year,
  status,
  showStatus = true,
  onAdd,
  placement,
}: {
  code: string;
  course: Course | undefined;
  year: number;
  status: "completed" | "planned" | "enrolled" | null;
  /** Kept for callers that still say whether the rule requires the course. */
  required?: boolean;
  /** Off where no plan sits behind the view, so every row would read the same. */
  showStatus?: boolean;
  onAdd?: (course: Course) => void;
  /** Where the course counts in the degree, for a course in the plan. */
  placement?: ReactNode;
}) {
  const completed = status === "completed";
  const planned = status === "planned" || status === "enrolled";
  const iconClass = "size-4 shrink-0";
  return (
    <li className="group relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm transition-colors focus-within:bg-muted/40 hover:bg-muted/30 motion-reduce:transition-none">
      {showStatus ? (
        completed ? (
          <Check className={cn(iconClass, "text-success")} aria-hidden="true" />
        ) : planned ? (
          <CalendarDays
            className={cn(iconClass, "text-muted-foreground")}
            aria-hidden="true"
          />
        ) : (
          <Circle
            className={cn(iconClass, "text-muted-foreground/60")}
            aria-hidden="true"
          />
        )
      ) : null}
      {course ? (
        <Link
          href={`/courses/${course.year ?? year}/${code.toLowerCase()}`}
          className="flex min-w-0 flex-1 items-baseline gap-2 outline-none after:absolute after:inset-0"
        >
          <span className="shrink-0 font-mono font-semibold">{code}</span>
          <span className="truncate text-muted-foreground">{course.name}</span>
          <ArrowRight
            className="size-3.5 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Link>
      ) : (
        <Hint label="Not available">
          <button
            type="button"
            aria-disabled="true"
            aria-label={`${code}: not available`}
            className="flex min-w-0 flex-1 cursor-default items-center gap-2 text-left font-mono font-semibold text-muted-foreground outline-none after:absolute after:inset-0"
          >
            {code}
            <LockKeyhole className="size-3.5" aria-hidden="true" />
          </button>
        </Hint>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {showStatus ? (
          <span className={cn(completed && "text-success")}>
            {completed
              ? "Completed"
              : status === "enrolled"
                ? "Enrolled"
                : planned
                  ? "Planned"
                  : "Not planned"}
          </span>
        ) : null}
        {course?.units ? (
          <span className="tabular-nums">{course.units} units</span>
        ) : null}
      </span>
      {showStatus && course && !status && onAdd ? (
        <Button
          variant="outline"
          size="sm"
          className="relative z-10 h-7"
          aria-label={`Add ${code} to plan`}
          onClick={() => onAdd(course)}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add
        </Button>
      ) : null}
      {showStatus && placement ? (
        <div className="relative z-10 w-full max-w-md pl-7">{placement}</div>
      ) : null}
    </li>
  );
}
