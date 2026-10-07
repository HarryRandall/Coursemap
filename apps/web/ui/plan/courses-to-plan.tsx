"use client";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  Plus,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import { sessionShortName } from "@/lib/coursemap/academic-periods";
import type {
  CourseToPlan,
  RuleCourse,
  RuleToPlan,
  StructureToPlan,
} from "@/ui/plan/plan-suggestions";

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

/**
 * One course a rule lists. A course already in the plan shows where it
 * stands; one that is not can be dragged into a semester or added to the
 * open year.
 */
function CourseRow({
  item,
  status,
  onAdd,
  onOpen,
  onDragStart,
}: {
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
      {inPlan ? (
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

/**
 * A rule as a group that opens to its courses, with how much of it the plan
 * covers. Rules that count units by filter name no courses, so they point to
 * the course directory instead.
 */
function RuleGroup({
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
  const [open, setOpen] = useState(
    () => !rule.covered && rule.courses.length > 0 && rule.courses.length <= 12,
  );
  const expandable = rule.courses.length > 0;
  const header = (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {rule.covered ? (
          <CheckCircle2
            size={13}
            aria-label="Covered"
            className="shrink-0 text-emerald-600 dark:text-emerald-400"
          />
        ) : null}
        <span className="truncate text-xs font-semibold text-foreground">
          {rule.heading}
        </span>
      </span>
      {rule.count ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
            rule.covered
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-primary/10 text-primary",
          )}
        >
          {rule.count}
        </span>
      ) : null}
      {expandable ? (
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      ) : null}
    </>
  );
  return (
    <section aria-label={rule.detail} className="space-y-1">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          title={rule.detail}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/50"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-1 py-1" title={rule.detail}>
          {header}
        </div>
      )}
      <p className="px-1 text-[11px] text-muted-foreground">{rule.detail}</p>
      {expandable && open ? (
        <ul>
          {rule.courses.map(({ code, course, status }) =>
            course ? (
              <CourseRow
                key={code}
                item={{
                  course,
                  required: rule.compulsory,
                  tag: rule.heading,
                  structureKind: kind,
                }}
                status={status}
                onAdd={onAdd}
                onOpen={onOpen}
                onDragStart={onDragStart}
              />
            ) : (
              <li
                key={code}
                className="grid grid-cols-[1.5rem_4.25rem_minmax(0,1fr)] items-center gap-x-1.5 py-1.5"
              >
                <span />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {code}
                </span>
                <span className="truncate text-[12px] text-muted-foreground">
                  Not published for this year
                </span>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {rule.note ? (
        <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
          {rule.note}
        </p>
      ) : !expandable ? (
        <Link
          href={rule.browse ? `/courses?${rule.browse}` : "/courses"}
          className="flex items-center gap-1 rounded-md px-1 py-1 text-[12px] text-primary transition hover:underline"
        >
          {rule.browse ? "Browse courses that count" : "Browse courses"}
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
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
 * Each part of the degree as a tab of its rules, in the style of a course
 * selector: every rule opens to the courses it names, marked as done or in
 * the plan, with the rest ready to drag into a semester or add.
 */
export function CoursesToPlan({
  structures,
  starred,
  inPlan,
  onAdd,
  onOpen,
  onDragStart,
}: {
  structures: StructureToPlan[];
  starred: CourseToPlan[];
  /** Where each course in the plan stands, for the starred list. */
  inPlan: ReadonlyMap<string, RuleCourse["status"]>;
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
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
                {item.openCount > 0 ? (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {item.openCount}
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
                  The {item.structure.name} has no rules to plan against yet.
                </p>
              ) : (
                item.rules.map((rule) => (
                  <RuleGroup
                    key={rule.key}
                    rule={rule}
                    kind={item.structure.kind}
                    onAdd={onAdd}
                    onOpen={onOpen}
                    onDragStart={onDragStart}
                  />
                ))
              )}
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
                    status={inPlan.get(item.course.code) ?? null}
                    onAdd={onAdd}
                    onOpen={onOpen}
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
