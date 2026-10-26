"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";
import type { AssistantCourseReference } from "@/lib/assistant/attachments";

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 200;

/**
 * A course named in a reply. Hovering previews it, like a link preview;
 * clicking or pressing Enter opens the same card for touch and keyboard use.
 */
export function AssistantCourseChip({
  course,
}: {
  course: AssistantCourseReference;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function after(delay: number, next: boolean) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  }
  const hover = {
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") after(OPEN_DELAY_MS, true);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") after(CLOSE_DELAY_MS, false);
    },
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${course.code} ${course.name}`}
          className="mx-px inline rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary decoration-primary/40 underline-offset-2 transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none data-[state=open]:bg-primary/20"
          {...hover}
        >
          {course.code}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 gap-0 p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        {...hover}
      >
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">{course.code}</p>
              <p className="text-sm leading-snug font-semibold">
                {course.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{course.units} units</Badge>
            {course.sessions.map((session) => (
              <Badge key={session} variant="secondary">
                {session}
              </Badge>
            ))}
            <Badge variant="outline">{course.year}</Badge>
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-medium text-muted-foreground">Prerequisites</p>
            <p className="leading-relaxed">
              {course.prerequisites ?? "None listed"}
            </p>
          </div>
        </div>
        <div className="border-t border-border p-2">
          <Button asChild size="sm" variant="ghost" className="w-full">
            <Link href={`/courses/${course.year}/${course.code.toLowerCase()}`}>
              Open course
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
