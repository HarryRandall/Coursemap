"use client";
import { CalendarDays, Check, Plus } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { CatalogueIdentity } from "@/ui/admin/catalogue-table/catalogue-table";
import type { Course } from "@/lib/coursemap/types";
import type { ReactNode } from "react";

/**
 * One course a rule lists, as a compact row: its status, code and name, and
 * where it counts or a way to add it. Every course links to its page, even
 * one the catalogue has not published yet.
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
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30 motion-reduce:transition-none">
      <div className="min-w-0 flex-1">
        <CatalogueIdentity
          code={code}
          title={course?.name ?? code}
          href={`/courses/${course?.year ?? year}/${code.toLowerCase()}`}
          meta={course?.units ? [`${course.units} units`] : []}
        />
      </div>
      <span className="flex shrink-0 items-center gap-2 text-xs">
        {showStatus ? (
          <Badge
            variant={
              completed
                ? "success-light"
                : planned
                  ? "primary-light"
                  : "secondary"
            }
          >
            {completed ? (
              <Check className="size-3" aria-hidden="true" />
            ) : planned ? (
              <CalendarDays className="size-3" aria-hidden="true" />
            ) : null}
            {completed
              ? "Completed"
              : status === "enrolled"
                ? "Enrolled"
                : planned
                  ? "Planned"
                  : "Not planned"}
          </Badge>
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
        <div className="relative z-10 min-w-0">{placement}</div>
      ) : null}
    </li>
  );
}
