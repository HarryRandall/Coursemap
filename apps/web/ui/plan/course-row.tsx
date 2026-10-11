"use client";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Check, CheckCircle2, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import { sessionShortName } from "@/lib/coursemap/academic-periods";
import type { CourseToPlan, RuleCourse } from "@/ui/plan/plan-suggestions";

export type DragStart = (
  event: ReactPointerEvent<HTMLButtonElement>,
  item: CourseToPlan,
) => void;

/** Sessions shown on a row before the rest fold into "+3". */
const SHOWN_SESSIONS = 2;

/** "S1 S2" first, then the short sessions, so semesters always lead. */
function sessionSummary(sessions: readonly string[]) {
  const labels = [...new Set(sessions.map(sessionShortName))].sort(
    (left, right) =>
      Number(!/^S[12]$/u.test(left)) - Number(!/^S[12]$/u.test(right)),
  );
  const shown = labels.slice(0, SHOWN_SESSIONS).join(" ");
  const more = labels.length - SHOWN_SESSIONS;
  return more > 0 ? `${shown} +${more}` : shown;
}

/**
 * One course a rule lists. A course already in the plan shows where it
 * stands; one that is not can be dragged into a semester or added to the
 * open year.
 */
export function CourseRow({
  item,
  status,
  onAdd,
  onOpen,
  onDragStart,
  readOnly = false,
}: {
  readOnly?: boolean;
  item: CourseToPlan;
  status: RuleCourse["status"];
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  onDragStart: DragStart;
}) {
  const inPlan = status !== null;
  return (
    <li
      data-drag-row
      className="group grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center rounded-lg transition hover:bg-muted/60"
    >
      {inPlan || readOnly ? (
        <span />
      ) : (
        <button
          type="button"
          aria-label={`Drag ${item.course.code} into a semester`}
          onPointerDown={(event) => onDragStart(event, item)}
          className="grid h-full cursor-grab touch-none place-items-center rounded-l-lg text-muted-foreground/30 group-hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical size={12} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen(item.course)}
        className="grid min-w-0 cursor-pointer grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-x-1.5 py-1.5 text-left"
      >
        <span
          className={cn(
            "font-mono text-[11px]",
            inPlan ? "text-muted-foreground/70" : "text-muted-foreground",
          )}
        >
          {item.course.code}
        </span>
        <span
          className={cn(
            "truncate text-[13px]",
            inPlan ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {item.course.name}
        </span>
        <span
          title={item.course.sessions.join(", ")}
          className="text-[10px] whitespace-nowrap text-muted-foreground tabular-nums"
        >
          {sessionSummary(item.course.sessions)}
        </span>
      </button>
      {status === "completed" ? (
        <span
          className="mx-1 grid size-7 place-items-center text-emerald-600 dark:text-emerald-400"
          title="Completed"
        >
          <CheckCircle2 size={14} aria-label="Completed" />
        </span>
      ) : inPlan ? (
        <span
          className="mx-1 grid size-7 place-items-center text-primary"
          title="In your plan"
        >
          <Check size={14} aria-label="In your plan" />
        </span>
      ) : readOnly ? (
        <span />
      ) : (
        <button
          type="button"
          onClick={() => onAdd(item.course)}
          aria-label={`Add ${item.course.code} to this year`}
          title="Add to this year"
          className="mx-1 grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
