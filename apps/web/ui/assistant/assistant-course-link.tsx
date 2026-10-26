"use client";

import Link from "next/link";
import {
  CalendarCheck,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  ListChecks,
} from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@coursemap/ui/primitives/popover";
import type { AssistantCourseReference } from "@/lib/assistant/attachments";
import { AssistantPreviewActions } from "./assistant-preview-actions";
import { useHoverPane } from "./use-hover-pane";

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
  const { open, setOpen, triggerProps, paneProps } = useHoverPane();
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
          {...triggerProps}
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
        {...paneProps}
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
        <AssistantPreviewActions
          href={assistantCourseHref(course)}
          openLabel="Open course"
          question={`Tell me about ${course.code} ${course.name}.`}
          onAsk={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
