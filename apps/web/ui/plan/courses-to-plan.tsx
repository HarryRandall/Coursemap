"use client";
import { useState } from "react";
import { Check, CheckCircle2 } from "lucide-react";
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
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import type {
  CourseToPlan,
  RuleCourse,
  StructureToPlan,
} from "@/ui/plan/plan-suggestions";
import { CourseRow, type DragStart } from "@/ui/plan/course-row";
import { RequiredCourses } from "@/ui/plan/required-courses";
import { RuleGroup } from "@/ui/plan/rule-group";

const KIND_LABELS: Record<PlanStructureKind, string> = {
  programme: "Degree",
  major: "Major",
  minor: "Minor",
  specialisation: "Specialisation",
};

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
    <div className="flex max-h-[70dvh] flex-col overflow-hidden rounded-xl border border-border bg-card lg:absolute lg:inset-0 lg:max-h-none">
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
            <TabsTrigger value="starred" className="shrink-0">
              Starred
              {starred.length > 0 ? (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {starred.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 [scrollbar-width:thin] [scrollbar-gutter:stable] overflow-y-auto border-t border-border py-3 pr-1.5 pl-3">
          {tabs.map(({ value, item }) => {
            const requiredRules = item.rules.filter(
              (rule) => !rule.covered && rule.compulsory,
            );
            // A degree total is filled by every other rule, so it only
            // repeats them here, and required courses sit above.
            const openRules = item.rules.filter(
              (rule) =>
                !rule.covered &&
                !rule.note &&
                !(
                  rule.compulsory &&
                  rule.courses.every(
                    (course) => course.status !== null || course.course,
                  )
                ),
            );
            const hasRequired = requiredRules.some((rule) =>
              rule.courses.some(
                (course) => course.status === null && course.course,
              ),
            );
            return (
              <TabsContent key={value} value={value} className="mt-0 space-y-4">
                {item.rules.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-muted-foreground">
                    The {item.structure.name} has no rules to plan against yet.
                  </p>
                ) : item.openCount === 0 &&
                  !hasRequired &&
                  openRules.length === 0 ? (
                  <RequirementsPlanned kind={item.structure.kind} />
                ) : (
                  <>
                    <RequiredCourses
                      rules={requiredRules}
                      kind={item.structure.kind}
                      onAdd={onAdd}
                      onOpen={onOpen}
                      onDragStart={onDragStart}
                    />
                    {openRules.map((rule) => (
                      <RuleGroup
                        key={rule.key}
                        rule={rule}
                        structureCode={item.structure.code}
                        kind={item.structure.kind}
                        onAdd={onAdd}
                        onOpen={onOpen}
                        onDragStart={onDragStart}
                      />
                    ))}
                  </>
                )}
              </TabsContent>
            );
          })}
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
