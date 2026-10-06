"use client";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import { useReturnFocus } from "@/hooks/use-return-focus";
import type { Course } from "@/lib/coursemap/types";
import { sessionShortName } from "@/lib/coursemap/academic-periods";
import { StarButton } from "@/ui/common/star-button";

/**
 * A course that is not in the plan yet, opened from the courses to plan: what
 * it covers, when it runs and what it needs, with the actions to place it.
 */
export function CoursePeek({
  course,
  addLabel,
  onAdd,
  onClose,
}: {
  course: Course;
  addLabel: string;
  onAdd: () => void;
  onClose: () => void;
}) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent {...returnFocus} className="max-w-lg">
        <div className="space-y-4 p-5 sm:p-6">
          <div className="space-y-1 pr-8">
            <p className="font-mono text-xs text-muted-foreground">
              {course.code} · {course.units} units
            </p>
            <DialogTitle className="text-lg leading-snug font-semibold">
              {course.name}
            </DialogTitle>
          </div>
          {course.sessions.length > 0 ? (
            <ul aria-label="Sessions" className="flex flex-wrap gap-1.5">
              {course.sessions.map((session) => (
                <li
                  key={session}
                  title={session}
                  className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {sessionShortName(session)}
                </li>
              ))}
            </ul>
          ) : null}
          {course.description ? (
            <DialogDescription className="line-clamp-5 text-[13px] leading-relaxed">
              {course.description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              {course.code} course details
            </DialogDescription>
          )}
          {course.prerequisiteText ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Requires</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {course.prerequisiteText}
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-5 py-3">
          <StarButton courseCode={course.code} />
          <Button asChild variant="ghost" size="sm">
            <Link href={`/courses/${course.year}/${course.code.toLowerCase()}`}>
              Course page
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              onAdd();
              onClose();
            }}
          >
            <Plus size={14} aria-hidden="true" />
            {addLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
