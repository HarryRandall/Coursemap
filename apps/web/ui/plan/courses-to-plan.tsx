"use client";
import { useState } from "react";
import { Check, CheckCircle2, ChevronDown } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
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
  CourseHints,
  CourseToPlan,
  RuleCourse,
  RuleToPlan,
  StructureToPlan,
} from "@/ui/plan/plan-suggestions";
import { CourseRow, type DragStart } from "@/ui/plan/course-row";
import { RequiredCourses } from "@/ui/plan/required-courses";
import { RuleGroup } from "@/ui/plan/rule-group";
import { SUGGESTION_COUNT } from "@/ui/plan/suggested-courses";

const KIND_LABELS: Record<PlanStructureKind, string> = {
  programme: "Degree",
  major: "Major",
  minor: "Minor",
  specialisation: "Specialisation",
};

/**
 * Whether a rule is a quick choice between a few named courses, which reads
 * best near the top, rather than a list to search.
 */
function isQuickChoice(rule: RuleToPlan) {
  return (
    rule.matching === null &&
    !rule.options?.length &&
    rule.courses.length > 0 &&
    rule.courses.filter((course) => course.status === null).length <=
      SUGGESTION_COUNT + 1
  );
}

/** A tab whose rules the plan already covers, so it reads as finished. */
function RequirementsPlanned({ kind }: { kind: PlanStructureKind }) {
  return (
    <Empty className="gap-0 px-4 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CheckCircle2 aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{`${KIND_LABELS[kind]} requirements planned`}</EmptyTitle>
        <EmptyDescription className="text-xs">
          A rule shows here again if a change to your plan reopens it.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** Whether a rule still needs courses picked, rather than only repeating others. */
function isOpenRule(rule: RuleToPlan) {
  return (
    !rule.covered &&
    !rule.note &&
    !(
      rule.compulsory &&
      rule.courses.every((course) => course.status !== null || course.course)
    )
  );
}

/**
 * The few courses each open rule suggests first, so a course that would
 * count twice is suggested once, by the first rule that lists it. Required
 * courses already show above every rule.
 */
function suggestionsByRule(
  rules: readonly RuleToPlan[],
  hints: CourseHints | undefined,
) {
  const shown = new Set(
    rules
      .filter((rule) => !rule.covered && rule.compulsory)
      .flatMap((rule) => rule.courses.map((course) => course.code)),
  );
  const byRule = new Map<string, string[]>();
  for (const rule of rules.filter(isOpenRule)) {
    const courses = rule.courses.flatMap((item) =>
      item.status === null && item.course ? [item.course] : [],
    );
    const ranked = hints ? hints.rank(courses) : courses;
    const picked = ranked
      .filter((course) => !shown.has(course.code))
      .slice(0, SUGGESTION_COUNT)
      .map((course) => course.code);
    picked.forEach((code) => shown.add(code));
    byRule.set(rule.key, picked);
  }
  return byRule;
}

/**
 * Each part of the degree as a tab: the courses it requires, then each rule
 * still open with what it needs and the courses that count, ready to drag
 * into a semester or add. Rules already met fold into one line that opens.
 */
export function CoursesToPlan({
  structures,
  starred,
  inPlan,
  hints,
  onAdd,
  onOpen,
  onDragStart,
}: {
  structures: StructureToPlan[];
  starred: CourseToPlan[];
  /** Where each course in the plan stands, for the starred list. */
  inPlan: ReadonlyMap<string, RuleCourse["status"]>;
  hints?: CourseHints;
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
  const [chosenTab, setTab] = useState(() => tabs[0]?.value ?? "starred");
  // Starred only shows while something is starred, so an emptied list falls
  // back to the first structure.
  const tab =
    chosenTab === "starred" && starred.length === 0 && tabs[0]
      ? tabs[0].value
      : chosenTab;
  return (
    <div className="flex max-h-[70dvh] flex-col overflow-hidden rounded-xl border border-border bg-card @4xl:absolute @4xl:inset-0 @4xl:max-h-none">
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 [scrollbar-width:none] overflow-x-auto px-3 pt-2 [&::-webkit-scrollbar]:hidden">
          <TabsList
            variant="line"
            aria-label="Courses to plan"
            className="flex-nowrap"
          >
            {tabs.map(({ value, label, item }) => (
              <TabsTrigger
                key={value}
                value={value}
                title={item.structure.name}
                className="max-w-[10rem] shrink-0"
                aria-label={`${label}: ${item.openCount} courses left to pick${item.estimatedCount ? " (estimate based on 6-unit courses)" : ""}`}
              >
                <span className="truncate">{label}</span>
                {item.openCount > 0 ? (
                  <Badge variant="warning-light" className="tabular-nums">
                    {item.openCount}
                  </Badge>
                ) : (
                  <Check
                    size={12}
                    aria-label="done"
                    className="text-emerald-600 dark:text-emerald-400"
                  />
                )}
              </TabsTrigger>
            ))}
            {starred.length > 0 || tabs.length === 0 ? (
              <TabsTrigger value="starred" className="shrink-0">
                Starred
                {starred.length > 0 ? (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {starred.length}
                  </span>
                ) : null}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 [scrollbar-width:thin] [scrollbar-gutter:stable] overflow-y-auto border-t border-border py-3 pr-1.5 pl-3">
          {tabs.map(({ value, item }) => (
            <TabsContent key={value} value={value} className="mt-0">
              {item.rules.length === 0 ? (
                <p className="px-1 py-1 text-xs text-muted-foreground">
                  The {item.structure.name} has no rules to plan against yet.
                </p>
              ) : (
                <StructureRules
                  item={item}
                  hints={hints}
                  onAdd={onAdd}
                  onOpen={onOpen}
                  onDragStart={onDragStart}
                />
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
                    prerequisites={hints?.prerequisites(item.course)}
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

function StructureRules({
  item,
  hints,
  onAdd,
  onOpen,
  onDragStart,
}: {
  item: StructureToPlan;
  hints?: CourseHints;
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  onDragStart: DragStart;
}) {
  const [showMet, setShowMet] = useState(false);
  const { structure, rules } = item;
  // Quick choices first, then the rules with long lists to search.
  const open = rules
    .filter(isOpenRule)
    .sort(
      (left, right) =>
        Number(!isQuickChoice(left)) - Number(!isQuickChoice(right)),
    );
  // A degree total repeats every other rule, so it stays out of both lists.
  const met = rules.filter((rule) => rule.covered && !rule.note);
  const suggested = suggestionsByRule(rules, hints);
  // The list opens on its first group: the required courses when there are
  // any, otherwise the first rule.
  const hasRequired = rules.some(
    (rule) =>
      !rule.covered &&
      rule.compulsory &&
      rule.courses.some((course) => course.status === null && course.course),
  );
  return (
    <div className="space-y-3 [&>*+*]:border-t [&>*+*]:border-border/70 [&>*+*]:pt-3">
      {open.length === 0 && !hasRequired ? (
        <RequirementsPlanned kind={structure.kind} />
      ) : null}
      <RequiredCourses
        rules={rules.filter((rule) => !rule.covered && rule.compulsory)}
        kind={structure.kind}
        hints={hints}
        onAdd={onAdd}
        onOpen={onOpen}
        onDragStart={onDragStart}
      />
      {open.map((rule, index) => (
        <RuleGroup
          key={rule.key}
          rule={rule}
          kind={structure.kind}
          defaultOpen={!hasRequired && index === 0}
          hints={hints}
          suggested={suggested.get(rule.key)}
          onAdd={onAdd}
          onOpen={onOpen}
          onDragStart={onDragStart}
        />
      ))}
      {met.length > 0 ? (
        <div>
          <button
            type="button"
            aria-expanded={showMet}
            onClick={() => setShowMet((value) => !value)}
            className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-1 text-left text-[12px] text-muted-foreground transition hover:text-foreground"
          >
            <CheckCircle2
              size={14}
              aria-hidden="true"
              className="text-emerald-600 dark:text-emerald-400"
            />
            <span className="flex-1">
              {met.length} {met.length === 1 ? "rule" : "rules"} done or planned
            </span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn("transition-transform", showMet && "rotate-180")}
            />
          </button>
          {showMet ? (
            <div
              role="group"
              aria-label="Rules done or planned"
              className="mt-1 space-y-1"
            >
              {met.map((rule) => (
                <RuleGroup
                  key={rule.key}
                  rule={rule}
                  kind={structure.kind}
                  hints={hints}
                  readOnly
                  onAdd={onAdd}
                  onOpen={onOpen}
                  onDragStart={onDragStart}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
