"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import type { RuleToPlan } from "@/ui/plan/plan-suggestions";
import { CourseRow, type DragStart } from "@/ui/plan/course-row";

/**
 * A rule as a group that opens to its courses, with how much of it the plan
 * covers. Rules that count units by filter name no courses, so they point to
 * the course directory instead.
 */
export function RuleGroup({
  rule,
  kind,
  onAdd,
  onOpen,
  onDragStart,
  readOnly = false,
}: {
  readOnly?: boolean;
  rule: RuleToPlan;
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
      {rule.note ? (
        <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
          {rule.note}
        </p>
      ) : !expandable && !readOnly ? (
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
