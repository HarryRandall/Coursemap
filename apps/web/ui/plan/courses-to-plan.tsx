"use client";
import { useId, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, GripVertical, Plus } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import type {
  CourseToPlan,
  PlannedStructure,
} from "@/ui/plan/plan-suggestions";
import { PlanRequirements } from "@/ui/plan/plan-requirements";

/** "First Semester" as S1, so a row can show every session it runs in. */
function sessionLabel(session: string) {
  if (/first|semester 1\b/i.test(session)) return "S1";
  if (/second|semester 2\b/i.test(session)) return "S2";
  return session.split(" ")[0];
}

function CourseList({
  label,
  items,
  onAdd,
  onDragStart,
}: {
  label: string;
  items: CourseToPlan[];
  onAdd: (course: Course) => void;
  onDragStart: (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: CourseToPlan,
  ) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={label} className="space-y-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.course.code}
            data-drag-row
            className="group flex items-center gap-1 rounded-lg bg-card ring-1 ring-border transition hover:ring-primary/40"
          >
            <button
              type="button"
              aria-label={`Drag ${item.course.code} ${item.course.name} into a semester`}
              onPointerDown={(event) => onDragStart(event, item)}
              className="grid min-w-0 flex-1 cursor-grab touch-none grid-cols-[1rem_4.5rem_minmax(0,1fr)] items-center gap-x-1.5 py-2 pl-2 text-left active:cursor-grabbing"
            >
              <GripVertical
                size={13}
                aria-hidden="true"
                className="row-span-2 text-muted-foreground/40 group-hover:text-muted-foreground"
              />
              <span className="row-span-2 font-mono text-[11px] text-muted-foreground">
                {item.course.code}
              </span>
              <span className="truncate text-[13px] font-medium text-foreground">
                {item.course.name}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
                <span
                  className={cn(
                    "truncate",
                    item.required
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                >
                  {item.tag}
                </span>
                {[...new Set(item.course.sessions.map(sessionLabel))].map(
                  (session) => (
                    <span
                      key={session}
                      className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground"
                    >
                      {session}
                    </span>
                  ),
                )}
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mr-1.5 shrink-0"
              onClick={() => onAdd(item.course)}
              aria-label={`Add ${item.course.code} to this year`}
              title="Add to this year"
            >
              <Plus size={14} aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What the plan still needs, as courses to drag into a semester. The rules
 * behind them fold away under one line.
 */
export function CoursesToPlan({
  required,
  suggested,
  structures,
  rulesLeft,
  onAdd,
  onDragStart,
  onHide,
}: {
  required: CourseToPlan[];
  suggested: CourseToPlan[];
  structures: PlannedStructure[];
  rulesLeft: number;
  onAdd: (course: Course) => void;
  onDragStart: (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: CourseToPlan,
  ) => void;
  onHide: () => void;
}) {
  const [showRules, setShowRules] = useState(false);
  const rulesId = useId();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Courses to plan
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onHide}>
          Hide
        </Button>
      </div>
      {required.length + suggested.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
          Every requirement has courses planned.
        </p>
      ) : (
        <>
          <CourseList
            label="Required"
            items={required}
            onAdd={onAdd}
            onDragStart={onDragStart}
          />
          <CourseList
            label="Suggested"
            items={suggested}
            onAdd={onAdd}
            onDragStart={onDragStart}
          />
        </>
      )}
      <section className="border-t border-border pt-3">
        <button
          type="button"
          aria-expanded={showRules}
          aria-controls={rulesId}
          onClick={() => setShowRules(!showRules)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-sm font-semibold text-foreground">
            Requirements
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {rulesLeft === 0 ? "All planned" : `${rulesLeft} still to plan`}
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn(
                "transition-transform motion-reduce:transition-none",
                showRules && "rotate-180",
              )}
            />
          </span>
        </button>
        <div id={rulesId} hidden={!showRules} className="mt-3">
          <PlanRequirements structures={structures} />
        </div>
      </section>
    </div>
  );
}
