"use client";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Check,
  CheckCircle2,
  CircleQuestionMark,
  GitBranch,
  GripVertical,
  Plus,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import { sessionShortName } from "@/lib/coursemap/academic-periods";
import type { PlanPrerequisites } from "@/lib/coursemap/term-placement";
import type { CourseToPlan, RuleCourse } from "@/ui/plan/plan-suggestions";

/** What the prerequisite mark says on hover, for each way a course stands. */
const PREREQUISITE_NOTES: Record<PlanPrerequisites, string> = {
  met: "Prerequisites covered",
  missing: "Needs a prerequisite",
  unknown: "Check the entry rules yourself",
  permission: "Needs permission to enrol",
};

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
 * stands; one that is not can be dragged into a semester or added, which
 * asks where it goes. A mark says whether the plan covers its prerequisites,
 * and when one is missing, opening the mark leads to adding it.
 */
export function CourseRow({
  item,
  status,
  onAdd,
  onOpen,
  onDragStart,
  readOnly = false,
  prerequisites,
}: {
  readOnly?: boolean;
  /** Where its prerequisites stand against the plan, for a course not in it. */
  prerequisites?: PlanPrerequisites;
  item: CourseToPlan;
  status: RuleCourse["status"];
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  /** Absent where there is no board to drag the course onto. */
  onDragStart?: DragStart;
}) {
  const inPlan = status !== null;
  return (
    <li
      data-drag-row
      className="group grid grid-cols-[1.5rem_minmax(0,1fr)_2.25rem_auto] items-center rounded-lg transition hover:bg-muted/60"
    >
      {inPlan || readOnly || !onDragStart ? (
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
      {prerequisites && !inPlan && !readOnly ? (
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() =>
                prerequisites === "missing"
                  ? onAdd(item.course)
                  : onOpen(item.course)
              }
              aria-label={`${item.course.code}: ${PREREQUISITE_NOTES[prerequisites]}`}
              className={cn(
                "grid size-6 cursor-pointer place-items-center justify-self-center rounded-md transition",
                prerequisites === "missing"
                  ? "text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  : prerequisites === "met"
                    ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {prerequisites === "missing" ? (
                <GitBranch size={13} aria-hidden="true" />
              ) : prerequisites === "met" ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <CircleQuestionMark size={13} aria-hidden="true" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {PREREQUISITE_NOTES[prerequisites]}
          </TooltipContent>
        </Tooltip>
      ) : status === "completed" ? (
        // A course in the plan shows where it stands right beside it.
        <span
          className="grid size-6 place-items-center justify-self-center text-emerald-600 dark:text-emerald-400"
          title="Completed"
        >
          <CheckCircle2 size={14} aria-label="Completed" />
        </span>
      ) : inPlan ? (
        <span
          className="grid size-6 place-items-center justify-self-center text-primary"
          title="In your plan"
        >
          <Check size={14} aria-label="In your plan" />
        </span>
      ) : (
        <span />
      )}
      {inPlan || readOnly ? (
        // Keeps the column so a read-only list lines up with the rest.
        <span aria-hidden="true" className="mx-1 size-7" />
      ) : (
        <button
          type="button"
          onClick={() => onAdd(item.course)}
          aria-label={`Add ${item.course.code} to your plan`}
          title="Add to your plan"
          className="mx-1 grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
