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
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { Hint } from "@/ui/common/hint";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";

export function RequirementCourseRow({
  code,
  course,
  year,
  status,
  required = false,
  onAdd,
}: {
  code: string;
  course: Course | undefined;
  year: number;
  status: "completed" | "planned" | "enrolled" | null;
  required?: boolean;
  onAdd?: (course: Course) => void;
}) {
  const completed = status === "completed";
  const planned = status === "planned" || status === "enrolled";
  return (
    <li
      className={cn(
        "group relative flex min-w-0 flex-col rounded-xl border p-4 transition-[border-color,background-color,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 motion-reduce:transition-none",
        course && "hover:shadow-sm",
        !course
          ? "border-border bg-muted/30"
          : completed
            ? "border-success/25 bg-success/5 hover:border-success/50 hover:bg-success/10"
            : planned
              ? "border-primary/25 bg-primary/5 hover:border-primary/50 hover:bg-primary/10"
              : "border-border bg-card hover:border-foreground/20 hover:bg-muted/40",
      )}
    >
      <p className="mb-2 text-xs text-muted-foreground">
        {required ? "Required" : "Course option"}
        {course?.units ? ` · ${course.units} units` : ""}
      </p>
      {course ? (
        <Link
          href={`/courses/${code}?year=${course?.year ?? year}`}
          className="min-w-0 flex-1 outline-none after:absolute after:inset-0 after:rounded-xl"
        >
          <span className="flex items-center justify-between gap-3 font-mono text-base font-semibold">
            {code}
            <ArrowRight
              className="size-4 text-muted-foreground transition-transform group-focus-within:text-foreground group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
              aria-hidden="true"
            />
          </span>
          {course && (
            <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {course.name}
            </span>
          )}
        </Link>
      ) : (
        <Hint label="Not available">
          <button
            type="button"
            aria-disabled="true"
            aria-label={`${code}: not available`}
            className="flex min-w-0 flex-1 cursor-default items-start justify-between gap-3 text-left font-mono text-base font-semibold text-muted-foreground outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {code}
            <LockKeyhole className="size-4" aria-hidden="true" />
          </button>
        </Hint>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
        <Badge
          variant={
            completed
              ? "success-light"
              : planned
                ? "primary-light"
                : "secondary"
          }
          size="lg"
        >
          {completed ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : planned ? (
            <CalendarDays className="size-3.5" aria-hidden="true" />
          ) : (
            <Circle className="size-3" aria-hidden="true" />
          )}
          {completed
            ? "Completed"
            : status === "enrolled"
              ? "Enrolled"
              : planned
                ? "Planned"
                : "Not planned"}
        </Badge>
        {course && !status && onAdd && (
          <Button
            variant="outline"
            size="sm"
            className="relative z-10"
            aria-label={`Add ${code} to plan`}
            onClick={() => onAdd(course)}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add to plan
          </Button>
        )}
      </div>
    </li>
  );
}
