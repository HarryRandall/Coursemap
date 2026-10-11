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
import { RequirementOverrideControl } from "@/ui/requirements/requirement-override-control";

/**
 * A rule as a group that opens to its courses, with how much of it the plan
 * covers. Rules that count units by filter name no courses, so they point to
 * the course directory instead.
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
    () => !rule.covered && rule.courses.length > 0 && rule.courses.length <= 12,
  );
  const courses = readOnly
    ? rule.courses
    : rule.courses.filter((item) => item.status === null);
  const expandable = courses.length > 0 || Boolean(rule.options?.length);
  const toggle = () => setOpen((value) => !value);
  const count = rule.count ? (
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
  ) : null;
  return (
    <section aria-label={rule.detail} className="space-y-1">
      {/* One line: the heading, an (i) with the rule in full, then progress. */}
      <div className="flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-muted/50">
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
        <span
          aria-hidden="true"
          onClick={expandable ? toggle : undefined}
          className={cn(
            "flex flex-1 items-center justify-end gap-1.5",
            expandable && "cursor-pointer",
          )}
        >
          {count}
          {expandable ? (
            <ChevronDown
              size={14}
              className={cn(
                "shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          ) : null}
        </span>
        {structureCode && rule.requirementKey && !readOnly ? (
          <RequirementOverrideControl
            structureCode={structureCode}
            requirementKey={rule.requirementKey}
          />
        ) : null}
      </div>
      {expandable && open ? (
        <ul>
          {courses.map(({ code, course, status }) =>
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
                readOnly={readOnly}
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
