"use client";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, Plus } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import type {
  CourseToPlan,
  PlannedStructure,
} from "@/ui/plan/plan-suggestions";
import { PlanRequirements } from "@/ui/plan/plan-requirements";
import { StarButton } from "@/ui/common/star-button";

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
    <section aria-label={label}>
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
            <StarButton courseCode={item.course.code} />
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

const KIND_LABELS: Partial<Record<PlanStructureKind, string>> = {
  major: "Major",
  minor: "Minor",
  specialisation: "Specialisation",
};

/**
 * What the plan still needs, as courses to drag into a semester, in a box of
 * its own that scrolls. Tabs split compulsory courses from suggestions and
 * each chosen major or minor, and keep the rules behind them one tab away.
 */
export function CoursesToPlan({
  required,
  suggested,
  starred,
  structures,
  rulesLeft,
  onAdd,
  onDragStart,
  onHide,
}: {
  required: CourseToPlan[];
  suggested: CourseToPlan[];
  starred: CourseToPlan[];
  structures: PlannedStructure[];
  rulesLeft: number;
  onAdd: (course: Course) => void;
  onDragStart: (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: CourseToPlan,
  ) => void;
  onHide: () => void;
}) {
  const kinds = [
    ...new Set(
      structures
        .map((structure) => structure.kind)
        .filter((kind) => kind !== "programme"),
    ),
  ];
  const tabs = [
    { value: "required", label: "Required", items: required },
    {
      value: "suggested",
      label: "Suggested",
      items: suggested.filter((item) => item.structureKind === "programme"),
    },
    ...kinds.map((kind) => ({
      value: kind,
      label: KIND_LABELS[kind] ?? kind,
      items: [...required, ...suggested].filter(
        (item) => item.structureKind === kind,
      ),
    })),
    { value: "starred", label: "Starred", items: starred },
  ];
  const [tab, setTab] = useState(
    () => tabs.find((item) => item.items.length > 0)?.value ?? "rules",
  );
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card lg:max-h-[calc(100dvh-12rem)]">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold text-foreground">
          Courses to plan
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onHide}>
          Hide
        </Button>
      </div>
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="overflow-x-auto px-3 pb-3">
          <TabsList aria-label="Courses to plan" className="w-full">
            {tabs.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
                <span className="text-muted-foreground tabular-nums">
                  {item.items.length}
                </span>
              </TabsTrigger>
            ))}
            <TabsTrigger value="rules">
              Rules
              <span className="text-muted-foreground tabular-nums">
                {rulesLeft}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-3 py-3">
          {tabs.map((item) => (
            <TabsContent key={item.value} value={item.value} className="mt-0">
              {item.items.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  {item.value === "required"
                    ? "Every compulsory course is in your plan."
                    : item.value === "starred"
                      ? "Star a course in search or in this list to keep it here."
                      : "Nothing to suggest here right now."}
                </p>
              ) : (
                <CourseList
                  label={item.label}
                  items={item.items}
                  onAdd={onAdd}
                  onDragStart={onDragStart}
                />
              )}
            </TabsContent>
          ))}
          <TabsContent value="rules" className="mt-0">
            <PlanRequirements structures={structures} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
