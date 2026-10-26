"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  ListChecks,
  MessageCircle,
} from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@coursemap/ui/primitives/popover";
import type { AssistantCourseReference } from "@/lib/assistant/attachments";
import { useAssistant } from "./assistant-provider";

const OPEN_DELAY_MS = 250;
const CLOSE_DELAY_MS = 150;

export function assistantCourseHref(course: AssistantCourseReference) {
  return `/courses/${course.year}/${course.code.toLowerCase()}`;
}

function PaneRow({
  icon: Icon,
  tone = "muted",
  children,
}: {
  icon: typeof CircleCheck;
  tone?: "muted" | "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <p className="flex min-w-0 items-center gap-2">
      <Icon
        aria-hidden="true"
        className={
          tone === "success"
            ? "size-3.5 shrink-0 text-success"
            : tone === "warning"
              ? "size-3.5 shrink-0 text-warning"
              : "size-3.5 shrink-0 text-muted-foreground"
        }
      />
      <span className="truncate">{children}</span>
    </p>
  );
}

function prerequisiteRow(course: AssistantCourseReference) {
  // Some catalogue entries already say there are none.
  const none =
    !course.prerequisites || /^no prerequisites/iu.test(course.prerequisites);
  if (none) return <PaneRow icon={CircleCheck}>No prerequisites</PaneRow>;
  if (course.prerequisitesMet === true)
    return (
      <PaneRow icon={CircleCheck} tone="success">
        Prerequisites met
      </PaneRow>
    );
  return (
    <PaneRow
      icon={course.prerequisitesMet === false ? CircleAlert : ListChecks}
      tone={course.prerequisitesMet === false ? "warning" : "muted"}
    >
      {course.prerequisitesMet === false ? "Not met: " : "Needs "}
      {course.prerequisites}
    </PaneRow>
  );
}

/**
 * A course code in a reply. It links to the course; resting on it shows a
 * preview pane, like a page mention in Notion. Every pane has the same size
 * and the same rows, so courses compare at a glance.
 */
export function AssistantCourseLink({
  course,
  className,
}: {
  course: AssistantCourseReference;
  className: string;
}) {
  const { askNow, streaming } = useAssistant();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // The pane belongs to a spot in the text, so scrolling the chat (or the
  // page) closes it rather than leaving it floating over other lines.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [open]);
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
  const facts = [
    `${course.units} units`,
    // ANU writes levels as "3000-level"; some records store just the digit.
    course.level
      ? `${course.level < 10 ? course.level * 1000 : course.level}-level`
      : null,
    String(course.year),
  ].filter(Boolean);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Link
          href={assistantCourseHref(course)}
          className={className}
          onFocus={() => after(OPEN_DELAY_MS, true)}
          onBlur={() => after(CLOSE_DELAY_MS, false)}
          {...hover}
        >
          {course.code}
        </Link>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        aria-label={`${course.code} ${course.name}`}
        className="flex h-48 w-72 flex-col gap-0 overflow-hidden p-0 text-xs"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onFocus={() => after(0, true)}
        onBlur={() => after(CLOSE_DELAY_MS, false)}
        {...hover}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3.5">
          <div className="space-y-0.5">
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-primary">{course.code}</span>
              <span className="text-muted-foreground tabular-nums">
                {facts.join(" · ")}
              </span>
            </p>
            <p className="truncate text-sm font-medium text-foreground">
              {course.name}
            </p>
          </div>
          <div className="mt-auto space-y-1.5 text-muted-foreground">
            {prerequisiteRow(course)}
            {course.planStatus ? (
              <PaneRow icon={CalendarCheck}>{course.planStatus}</PaneRow>
            ) : (
              <PaneRow icon={CalendarDays}>
                {course.sessions.length
                  ? `Offered ${course.sessions.join(", ")}`
                  : "Not in your plan"}
              </PaneRow>
            )}
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 border-t border-border">
          <Link
            href={assistantCourseHref(course)}
            className="flex items-center justify-center gap-1.5 py-2.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
            Open course
          </Link>
          <button
            type="button"
            disabled={Boolean(streaming)}
            onClick={() => {
              setOpen(false);
              askNow(`Tell me about ${course.code} ${course.name}.`);
            }}
            className="flex items-center justify-center gap-1.5 border-l border-border py-2.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50"
          >
            <MessageCircle aria-hidden="true" className="size-3.5" />
            Ask in chat
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
