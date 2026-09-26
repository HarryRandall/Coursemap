"use client";
import { useId, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, GripVertical, Plus } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { cn } from "@/lib/cn";
import type { Course, Term } from "@/lib/coursemap/types";
import type { TermSuggestion } from "@/ui/plan/term-suggestions";

/**
 * Courses that would fill the open semester, each with the requirement it
 * moves along. Drag one into the semester or add it with the button.
 */
export function TermSuggestionsPanel({
  term,
  suggestions,
  open,
  onOpenChange,
  emptyMessage,
  onAdd,
  onDragStart,
}: {
  term: Term;
  suggestions: TermSuggestion[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Why nothing is suggested, such as the semester being full. */
  emptyMessage: string;
  onAdd: (course: Course) => void;
  onDragStart: (
    event: ReactPointerEvent<HTMLButtonElement>,
    suggestion: TermSuggestion,
  ) => void;
}) {
  const listId = useId();
  const title =
    term.id === "unscheduled"
      ? "Suggested for later"
      : `Suggested for ${term.name} ${term.year}`;
  return (
    <section aria-label={title} className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => onOpenChange(!open)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm font-semibold text-foreground">
          {title}
          {suggestions.length > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {suggestions.length}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {open ? "Hide" : "Show"}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn(
              "transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      <div id={listId} hidden={!open}>
        {suggestions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {suggestions.map((suggestion) => {
              const { course } = suggestion;
              const waiting = suggestion.missingCodes.length > 0;
              return (
                <li
                  key={course.code}
                  data-drag-row
                  className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-1 py-1.5 pr-2.5"
                >
                  <button
                    type="button"
                    aria-label={`Drag ${course.code} into a semester`}
                    onPointerDown={(event) => onDragStart(event, suggestion)}
                    className="grid h-full cursor-grab touch-none place-items-center text-muted-foreground/40 transition hover:text-muted-foreground active:cursor-grabbing"
                  >
                    <GripVertical size={13} aria-hidden="true" />
                  </button>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-baseline gap-2.5">
                      <span className="w-[4.75rem] shrink-0 font-mono text-[11px] text-muted-foreground">
                        {course.code}
                      </span>
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {course.name}
                      </span>
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 truncate pl-[7.375rem] text-[11px] max-sm:pl-0",
                        suggestion.required && !waiting
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {waiting
                        ? `Needs ${suggestion.missingCodes.join(" + ")} first`
                        : suggestion.unchecked
                          ? `${suggestion.reason} · check the prerequisites`
                          : suggestion.reason}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onAdd(course)}
                    aria-label={`Add ${course.code} to ${term.name} ${term.year}`}
                  >
                    <Plus size={13} aria-hidden="true" />
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
