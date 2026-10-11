"use client";
import { useState } from "react";
import { Check } from "lucide-react";
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
import { RuleGroup } from "@/ui/plan/rule-group";

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
  const [showCovered, setShowCovered] = useState(false);
  const [tab, setTab] = useState(() => tabs[0]?.value ?? "starred");
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card lg:h-[calc(100dvh-12rem)]">
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 overflow-x-auto px-3 pt-2">
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
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-3 py-3">
          {tabs.map(({ value, item }) => (
            <TabsContent key={value} value={value} className="mt-0 space-y-4">
              {item.rules.length === 0 ? (
                <p className="px-1 py-1 text-xs text-muted-foreground">
                  The {item.structure.name} has no rules to plan against yet.
                </p>
              ) : (
                item.rules
                  .filter((rule) => !rule.covered)
                  .map((rule) => (
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
              {item.estimatedCount && item.openCount > 0 ? (
                <p className="px-1 text-[11px] text-muted-foreground">
                  Course count estimated using 6-unit courses for unit-only
                  rules.
                </p>
              ) : null}
              {item.rules.some((rule) => rule.covered) ? (
                <div className="space-y-3 border-t border-border pt-3">
                  <button
                    type="button"
                    aria-expanded={showCovered}
                    onClick={() => setShowCovered((value) => !value)}
                    className="cursor-pointer text-xs text-muted-foreground"
                  >
                    {item.rules.filter((rule) => rule.covered).length} rules
                    covered · {showCovered ? "Hide" : "Show"}
                  </button>
                  {showCovered &&
                    item.rules
                      .filter((rule) => rule.covered)
                      .map((rule) => (
                        <RuleGroup
                          key={rule.key}
                          rule={rule}
                          kind={item.structure.kind}
                          onAdd={onAdd}
                          onOpen={onOpen}
                          onDragStart={onDragStart}
                          readOnly
                        />
                      ))}
                </div>
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
