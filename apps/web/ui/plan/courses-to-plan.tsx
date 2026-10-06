"use client";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, GripVertical, Plus } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import { sessionShortName } from "@/lib/coursemap/academic-periods";
import type {
  CourseToPlan,
  RuleToPlan,
  StructureToPlan,
} from "@/ui/plan/plan-suggestions";
import { CoursePeek } from "@/ui/plan/course-peek";

type DragStart = (
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

function CourseRow({
  item,
  onAdd,
  onOpen,
  onDragStart,
}: {
  item: CourseToPlan;
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  onDragStart: DragStart;
}) {
  return (
    <li
      data-drag-row
      className="group grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center rounded-lg transition hover:bg-muted/60"
    >
      <button
        type="button"
        aria-label={`Drag ${item.course.code} into a semester`}
        onPointerDown={(event) => onDragStart(event, item)}
        className="grid h-full cursor-grab touch-none place-items-center rounded-l-lg text-muted-foreground/30 group-hover:text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical size={12} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onOpen(item.course)}
        className="grid min-w-0 cursor-pointer grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-x-1.5 py-1.5 text-left"
      >
        <span className="font-mono text-[11px] text-muted-foreground">
          {item.course.code}
        </span>
        <span className="truncate text-[13px] text-foreground">
          {item.course.name}
        </span>
        <span
          title={item.course.sessions.join(", ")}
          className="text-[10px] whitespace-nowrap text-muted-foreground tabular-nums"
        >
          {sessionSummary(item.course.sessions)}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onAdd(item.course)}
        aria-label={`Add ${item.course.code} to this year`}
        title="Add to this year"
        className="mx-1 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground [@media(hover:none)]:opacity-100"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Where the student settles a rule the planner will not decide for them:
 * the Requirements tab for a list of options, or the course directory
 * filtered to what counts.
 */
function RuleChoiceLink({
  rule,
  kind,
}: {
  rule: RuleToPlan;
  kind: PlanStructureKind;
}) {
  const [href, label] =
    rule.options > 0
      ? [
          `/requirements?tab=${kind}`,
          `Choose from ${rule.options} in Requirements`,
        ]
      : rule.browse
        ? [`/courses?${rule.browse}`, "Browse courses that count"]
        : ["/courses", "Browse courses"];
  return (
    <Link
      href={href}
      className="flex items-center gap-1 rounded-md px-1 py-1 text-[12px] text-muted-foreground transition hover:text-foreground"
    >
      {label}
      <ArrowRight size={12} aria-hidden="true" />
    </Link>
  );
}

function RuleSection({
  rule,
  kind,
  onAdd,
  onOpen,
  onDragStart,
}: {
  rule: RuleToPlan;
  kind: PlanStructureKind;
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  onDragStart: DragStart;
}) {
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
      {rule.courses.length > 0 ? (
        <ul>
          {rule.courses.map((item) => (
            <CourseRow
              key={item.course.code}
              item={item}
              onAdd={onAdd}
              onOpen={onOpen}
              onDragStart={onDragStart}
            />
          ))}
        </ul>
      ) : null}
      {rule.compulsory ? null : <RuleChoiceLink rule={rule} kind={kind} />}
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
 * What the plan still needs, one tab per part of the degree: compulsory
 * courses and the student's own picks to drag into a semester, a link to
 * settle each open choice, and the rules already covered folded into one line.
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
  const [peek, setPeek] = useState<Course | null>(null);
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
                    kind={item.structure.kind}
                    onAdd={onAdd}
                    onOpen={setPeek}
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
                Star a course in Requirements or search and it waits here.
              </p>
            ) : (
              <ul>
                {starred.map((item) => (
                  <CourseRow
                    key={item.course.code}
                    item={item}
                    onAdd={onAdd}
                    onOpen={setPeek}
                    onDragStart={onDragStart}
                  />
                ))}
              </ul>
            )}
          </TabsContent>
        </div>
      </Tabs>
      {peek ? (
        <CoursePeek
          course={peek}
          addLabel="Add to this year"
          onAdd={() => onAdd(peek)}
          onClose={() => setPeek(null)}
        />
      ) : null}
    </div>
  );
}
