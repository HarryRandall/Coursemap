"use client";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, GripVertical, Plus } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import type {
  CourseToPlan,
  RuleToPlan,
  StructureToPlan,
} from "@/ui/plan/plan-suggestions";
import { StarButton } from "@/ui/common/star-button";

type DragStart = (
  event: ReactPointerEvent<HTMLButtonElement>,
  item: CourseToPlan,
) => void;

/** "First Semester" as S1, so a row can show every session it runs in. */
function sessionLabel(session: string) {
  if (/first|semester 1\b/i.test(session)) return "S1";
  if (/second|semester 2\b/i.test(session)) return "S2";
  return session.split(" ")[0];
}

function CourseRow({
  item,
  onAdd,
  onDragStart,
}: {
  item: CourseToPlan;
  onAdd: (course: Course) => void;
  onDragStart: DragStart;
}) {
  return (
    <li
      data-drag-row
      className="group flex items-center gap-1 rounded-lg transition hover:bg-muted/60"
    >
      <button
        type="button"
        aria-label={`Drag ${item.course.code} ${item.course.name} into a semester`}
        onPointerDown={(event) => onDragStart(event, item)}
        className="grid min-w-0 flex-1 cursor-grab touch-none grid-cols-[0.75rem_4.25rem_minmax(0,1fr)_auto] items-center gap-x-1.5 py-1.5 pl-1 text-left active:cursor-grabbing"
      >
        <GripVertical
          size={12}
          aria-hidden="true"
          className="text-muted-foreground/30 group-hover:text-muted-foreground"
        />
        <span className="font-mono text-[11px] text-muted-foreground">
          {item.course.code}
        </span>
        <span className="truncate text-[13px] text-foreground">
          {item.course.name}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {[...new Set(item.course.sessions.map(sessionLabel))].join(" ")}
        </span>
      </button>
      <span className="flex shrink-0 items-center opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <StarButton courseCode={item.course.code} />
        <button
          type="button"
          onClick={() => onAdd(item.course)}
          aria-label={`Add ${item.course.code} to this year`}
          title="Add to this year"
          className="mr-1 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}

const SHOWN = 3;

function RuleSection({
  rule,
  onAdd,
  onDragStart,
}: {
  rule: RuleToPlan;
  onAdd: (course: Course) => void;
  onDragStart: DragStart;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown =
    rule.compulsory || expanded ? rule.courses : rule.courses.slice(0, SHOWN);
  const hidden = rule.courses.length - shown.length;
  return (
    <section aria-label={rule.detail} className="space-y-1">
      <div className="px-1" title={rule.detail}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate text-xs font-semibold text-foreground">
            {rule.heading}
          </h3>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {rule.left}
          </span>
        </div>
        <div
          aria-hidden="true"
          className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary/60"
            style={{ width: `${rule.progress * 100}%` }}
          />
        </div>
      </div>
      {shown.length > 0 ? (
        <ul>
          {shown.map((item) => (
            <CourseRow
              key={item.course.code}
              item={item}
              onAdd={onAdd}
              onDragStart={onDragStart}
            />
          ))}
        </ul>
      ) : (
        <p className="px-1 text-[11px] text-muted-foreground">
          Search for a course that fits.
        </p>
      )}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="px-1 text-[11px] font-medium text-primary"
        >
          {hidden} more
        </button>
      ) : null}
    </section>
  );
}

const KIND_LABELS: Record<PlanStructureKind, string> = {
  programme: "Degree",
  major: "Major",
  minor: "Minor",
  specialisation: "Specialisation",
};

/**
 * What the plan still needs, one tab per part of the degree: each open rule
 * in a few words with courses under it to drag into a semester, and the
 * rules already covered folded into one line.
 */
export function CoursesToPlan({
  structures,
  starred,
  onAdd,
  onDragStart,
}: {
  structures: StructureToPlan[];
  starred: CourseToPlan[];
  onAdd: (course: Course) => void;
  onDragStart: DragStart;
}) {
  const kindCount = (kind: PlanStructureKind) =>
    structures.filter((item) => item.structure.kind === kind).length;
  const tabs = structures.map((item) => ({
    value: item.structure.code,
    label:
      kindCount(item.structure.kind) > 1
        ? item.structure.name
        : KIND_LABELS[item.structure.kind],
    item,
  }));
  const [tab, setTab] = useState(() => tabs[0]?.value ?? "starred");
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card lg:max-h-[calc(100dvh-12rem)]">
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="overflow-x-auto px-3 pt-2">
          <TabsList variant="line" aria-label="Courses to plan">
            {tabs.map(({ value, label, item }) => (
              <TabsTrigger
                key={value}
                value={value}
                title={item.structure.name}
                className="max-w-[10rem]"
              >
                <span className="truncate">{label}</span>
                {item.rules.length > 0 ? (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {item.rules.length}
                  </span>
                ) : (
                  <Check
                    size={12}
                    aria-label="done"
                    className="text-emerald-600 dark:text-emerald-400"
                  />
                )}
              </TabsTrigger>
            ))}
            <TabsTrigger value="starred">
              Starred
              {starred.length > 0 ? (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {starred.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-3 py-3">
          {tabs.map(({ value, item }) => (
            <TabsContent key={value} value={value} className="mt-0 space-y-4">
              {item.rules.length === 0 ? (
                <p className="px-1 py-1 text-xs text-muted-foreground">
                  Everything for the {item.structure.name} is in your plan.
                </p>
              ) : (
                item.rules.map((rule) => (
                  <RuleSection
                    key={rule.key}
                    rule={rule}
                    onAdd={onAdd}
                    onDragStart={onDragStart}
                  />
                ))
              )}
              {item.doneCount > 0 ? (
                <p className="flex items-center gap-1.5 border-t border-border px-1 pt-3 text-[11px] text-emerald-700 dark:text-emerald-400">
                  <Check size={12} aria-hidden="true" />
                  {item.doneCount} {item.doneCount === 1 ? "rule" : "rules"}{" "}
                  covered
                </p>
              ) : null}
            </TabsContent>
          ))}
          <TabsContent value="starred" className="mt-0">
            {starred.length === 0 ? (
              <p className="px-1 py-1 text-xs text-muted-foreground">
                Star a course and it waits here.
              </p>
            ) : (
              <ul>
                {starred.map((item) => (
                  <CourseRow
                    key={item.course.code}
                    item={item}
                    onAdd={onAdd}
                    onDragStart={onDragStart}
                  />
                ))}
              </ul>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
