"use client";
import { useId, useState } from "react";
import { ChevronDown, ListChecks, Layers } from "lucide-react";
import type { PlanRequirementCondition } from "@/lib/coursemap/plan-catalogue";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import { requirementCourseHeading } from "@/lib/coursemap/requirement-display";
import {
  conditionInterpretation,
  unitsDescription,
} from "@/ui/requirements/requirement-presentation";
import type { TreeContext } from "@/ui/requirements/requirement-presentation";
import { RequirementCourseOptions } from "./requirement-course-options";
import { UnitsBar } from "@/ui/requirements/units-bar";

export function RequirementCondition({
  condition,
  context,
}: {
  condition: PlanRequirementCondition;
  context: TreeContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  if (
    condition.conditionKind === "unit_total" &&
    condition.minimumUnits === context.unitTarget &&
    condition.maximumUnits === null
  )
    return null;
  if (condition.conditionKind === "structure_list") return null;
  const options = condition.options.filter(
    (option) => option.kind === "course",
  );
  const progress = context.progress.get(requirementNodeKey(condition));
  const measurable = progress && progress.state !== "unmeasured";
  const units = unitsDescription(
    condition.minimumUnits,
    condition.maximumUnits,
  );
  if (options.length === 0)
    return (
      <p className="rounded-xl border border-border bg-card px-5 py-4 text-sm">
        {conditionInterpretation(condition) || condition.freeText}
      </p>
    );
  const codes = [...new Set(options.map((option) => option.code))];
  const required =
    condition.minimumCourses !== null &&
    condition.minimumCourses >= codes.length;
  const done = codes.filter(
    (code) => context.attemptStatusByCode.get(code) === "completed",
  ).length;
  const planned = codes.filter((code) =>
    ["planned", "enrolled"].includes(
      context.attemptStatusByCode.get(code) ?? "",
    ),
  ).length;
  const target = condition.minimumCourses;
  const caption =
    target !== null
      ? [
          done > 0 ? `${done} completed` : null,
          planned > 0 ? `${planned} planned` : null,
          target > done + planned
            ? `${target - done - planned} ${target - done - planned === 1 ? "course" : "courses"} ${required ? "to plan" : "to choose"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : measurable
        ? `${progress.completedUnits} units completed · ${progress.plannedUnits} planned`
        : null;
  return (
    <section className="relative rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] has-[button[data-section-toggle]:focus-visible]:ring-2 has-[button[data-section-toggle]:focus-visible]:ring-ring has-[button[data-section-toggle]:hover]:border-foreground/20 has-[button[data-section-toggle]:hover]:shadow-sm motion-reduce:transition-none sm:p-5">
      <div className="group flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {required ? (
            <ListChecks className="size-5" aria-hidden="true" />
          ) : (
            <Layers className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight">
            <button
              type="button"
              data-section-toggle
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-controls={panelId}
              className="text-left outline-none after:absolute after:inset-0 after:cursor-pointer after:rounded-xl"
            >
              {required
                ? codes.length === 1
                  ? "Required course"
                  : "Required courses"
                : requirementCourseHeading(condition)}
              <span className="sr-only">
                {" "}
                · {expanded ? "Hide courses" : "View courses"}
              </span>
            </button>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {units} · {codes.length}{" "}
            {required ? (codes.length === 1 ? "course" : "courses") : "options"}
          </p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
        />
      </div>
      {target !== null && target > 0 ? (
        <div
          aria-hidden="true"
          className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-muted-foreground/20"
        >
          <span
            className="bg-success"
            style={{ width: `${Math.min(100, (done / target) * 100)}%` }}
          />
          <span
            className="bg-primary"
            style={{
              width: `${Math.min(Math.max(0, 100 - (done / target) * 100), (planned / target) * 100)}%`,
            }}
          />
        </div>
      ) : measurable ? (
        <UnitsBar progress={progress} className="mt-4" />
      ) : null}
      {caption && (
        <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
      )}
      {progress?.state === "over_limit" && (
        <p className="mt-2 text-xs text-destructive">
          Above this requirement&apos;s limit
        </p>
      )}
      <div id={panelId} hidden={!expanded} className="relative z-10">
        {expanded && (
          <div className="mt-5 border-t border-border/60 pt-5">
            <RequirementCourseOptions
              codes={codes}
              required={required}
              context={context}
            />
          </div>
        )}
      </div>
    </section>
  );
}
