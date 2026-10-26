"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import type { RuleToPlan } from "@/ui/plan/plan-suggestions";
import { CourseRow, type DragStart } from "@/ui/plan/course-row";
import { RuleMatchingCourses } from "@/ui/plan/rule-matching-courses";
import { RequirementOverrideControl } from "@/ui/requirements/requirement-override-control";

/**
 * A rule as a group that opens to its courses, with how much of it the plan
 * covers. Tag and subject rules load the courses they match; a rule any
 * course fills points to the course directory instead.
 */
export function RuleGroup({
  rule,
  structureCode,
  kind,
  onAdd,
  onOpen,
  onDragStart,
  readOnly = false,
}: {
  readOnly?: boolean;
  rule: RuleToPlan;
  /** The structure the rule belongs to, so it can be marked satisfied. */
  structureCode?: string;
  kind: PlanStructureKind;
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  onDragStart: DragStart;
}) {
  const [open, setOpen] = useState(
    () =>
      !rule.covered &&
      ((rule.courses.length > 0 && rule.courses.length <= 12) ||
        rule.matching !== null),
  );
  // A course no catalogue year publishes cannot be planned, so it is left out.
  const courses = rule.courses.flatMap(({ code, course, status }) =>
    course && (readOnly || status === null) ? [{ code, course, status }] : [],
  );
  const expandable =
    courses.length > 0 ||
    Boolean(rule.options?.length) ||
    rule.matching !== null;
  const toggle = () => setOpen((value) => !value);
  const count = rule.count ? (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums",
        rule.covered
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-primary/10 text-primary",
      )}
    >
      {rule.count}
    </span>
  ) : null;
  return (
    <section aria-label={rule.detail} className="space-y-1">
      {/* One line: the heading, an (i) with the rule in full, then progress. */}
      <div className="flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-muted/50">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {rule.covered ? (
            <CheckCircle2
              size={13}
              aria-label="Covered"
              className="shrink-0 text-emerald-600 dark:text-emerald-400"
            />
          ) : null}
          {expandable ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={toggle}
              className="min-w-0 cursor-pointer truncate text-left text-xs font-semibold text-foreground"
            >
              {rule.heading}
            </button>
          ) : (
            <span className="min-w-0 truncate text-xs font-semibold text-foreground">
              {rule.heading}
            </span>
          )}
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${rule.heading}: ${rule.detail}`}
                className="grid size-5 shrink-0 cursor-help place-items-center rounded text-muted-foreground/70 transition hover:text-foreground"
              >
                <Info size={12} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-xs">
              {rule.detail}
            </TooltipContent>
          </Tooltip>
          {expandable ? (
            <span
              aria-hidden="true"
              onClick={toggle}
              className="min-w-2 flex-1 cursor-pointer self-stretch"
            />
          ) : null}
        </span>
        {count}
        {expandable ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={toggle}
            className="grid size-5 shrink-0 cursor-pointer place-items-center text-muted-foreground"
          >
            <ChevronDown
              size={14}
              className={cn("transition-transform", open && "rotate-180")}
            />
          </button>
        ) : null}
        {structureCode && rule.requirementKey && !readOnly ? (
          <RequirementOverrideControl
            structureCode={structureCode}
            requirementKey={rule.requirementKey}
          />
        ) : null}
      </div>
      {expandable && open ? (
        <ul>
          {courses.map(({ code, course, status }) => (
            <CourseRow
              key={code}
              item={{
                course,
                required: rule.compulsory,
                tag: rule.heading,
                structureKind: kind,
              }}
              status={status}
              readOnly={readOnly}
              onAdd={onAdd}
              onOpen={onOpen}
              onDragStart={onDragStart}
            />
          ))}
        </ul>
      ) : null}
      {expandable && open && rule.matching ? (
        <RuleMatchingCourses
          rule={rule}
          matching={rule.matching}
          kind={kind}
          onAdd={onAdd}
          onOpen={onOpen}
          onDragStart={onDragStart}
          readOnly={readOnly}
        />
      ) : null}
      {open &&
        rule.options?.map((option) => (
          <div key={option.key} className="ml-3 border-l border-border pl-2">
            <RuleGroup
              rule={option}
              kind={kind}
              onAdd={onAdd}
              onOpen={onOpen}
              onDragStart={onDragStart}
              readOnly={readOnly}
            />
          </div>
        ))}
      {!expandable && !readOnly ? (
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
