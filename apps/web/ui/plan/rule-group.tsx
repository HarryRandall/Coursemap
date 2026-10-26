"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import type { CourseHints, RuleToPlan } from "@/ui/plan/plan-suggestions";
import type { DragStart } from "@/ui/plan/course-row";
import { hasRuleCourses, RuleCourses } from "@/ui/plan/rule-courses";
import { UnitsBar } from "@/ui/requirements/units-bar";

/** Whether a rule's heading already says how many to choose, as "Pick one: A or B" does. */
export function headingSaysChoice(rule: RuleToPlan) {
  return rule.choice !== null && /^pick\b/iu.test(rule.heading);
}

/**
 * A rule as a group: its heading with what it still needs, then, once open,
 * a bar of how far the plan has come and the courses that count. Marking a
 * rule satisfied lives on Requirements, so this list only ever asks what to
 * add.
 */
export function RuleGroup({
  rule,
  kind,
  defaultOpen = false,
  hints,
  suggested,
  onAdd,
  onOpen,
  onDragStart,
  readOnly = false,
}: {
  readOnly?: boolean;
  rule: RuleToPlan;
  kind: PlanStructureKind;
  /** Opens the group at first, for the first rule in a list. */
  defaultOpen?: boolean;
  hints?: CourseHints;
  /** Codes to suggest first, chosen so another group does not repeat them. */
  suggested?: readonly string[];
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  onDragStart?: DragStart;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // A bar of zero or one course says nothing a pick rule's heading does not.
  const pickRule = rule.choice !== null;
  const expandable = hasRuleCourses(rule, hints, readOnly);
  const toggle = () => setOpen((value) => !value);
  return (
    <section aria-label={rule.detail} className="space-y-2">
      <div className="space-y-2 px-1">
        <div className="flex min-h-7 items-center gap-2">
          {rule.covered ? (
            <CheckCircle2
              size={14}
              aria-label="Covered"
              className="shrink-0 text-emerald-600 dark:text-emerald-400"
            />
          ) : null}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              {expandable ? (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={toggle}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left text-[13px] font-semibold text-foreground"
                >
                  {rule.heading}
                </button>
              ) : (
                <span
                  tabIndex={0}
                  className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground"
                >
                  {rule.heading}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-xs">
              {rule.detail}
            </TooltipContent>
          </Tooltip>
          {rule.left && !headingSaysChoice(rule) ? (
            <Badge variant="warning-light" className="tabular-nums">
              {rule.left}
            </Badge>
          ) : null}
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
        </div>
        {open && rule.bar && !rule.covered && !pickRule ? (
          <div className="flex items-center gap-2.5">
            <UnitsBar
              completed={rule.bar.completed}
              planned={rule.bar.planned}
              goal={rule.bar.target}
              className="flex-1"
            />
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {rule.count}
            </span>
          </div>
        ) : null}
        {rule.note && !readOnly ? (
          <p className="text-[11px] text-muted-foreground">{rule.note}</p>
        ) : null}
      </div>
      {expandable && open ? (
        <RuleCourses
          rule={rule}
          kind={kind}
          hints={hints}
          suggested={suggested}
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
              hints={hints}
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
