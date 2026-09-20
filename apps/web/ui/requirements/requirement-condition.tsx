"use client";
import { useId, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  CircleAlert,
  GaugeCircle,
  Info,
  Layers,
  ListChecks,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import { requirementCourseHeading } from "@/lib/coursemap/requirement-display";
import {
  conditionHeading,
  conditionInterpretation,
  conditionTone,
  unitsDescription,
} from "@/ui/requirements/requirement-presentation";
import type {
  RequirementTreeCondition,
  TreeContext,
} from "@/ui/requirements/requirement-presentation";
import { RequirementCourseOptions } from "./requirement-course-options";
import { UnitsBar } from "@/ui/requirements/units-bar";

/** A rule with no course list of its own: units, levels, tags and electives. */
function StatedCondition({
  condition,
}: {
  condition: RequirementTreeCondition;
}) {
  const tone = conditionTone(condition);
  const interpretation =
    conditionInterpretation(condition) || condition.freeText;
  if (tone === "warning" || tone === "note") {
    return (
      <Alert variant={tone === "warning" ? "warning" : "default"}>
        {tone === "warning" ? (
          <CircleAlert aria-hidden="true" />
        ) : (
          <Info aria-hidden="true" />
        )}
        <AlertTitle>{conditionHeading(condition)}</AlertTitle>
        <AlertDescription>{interpretation}</AlertDescription>
      </Alert>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <GaugeCircle className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight">
            {conditionHeading(condition)}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {interpretation}
          </p>
        </div>
        {tone === "limit" ? <Badge variant="secondary">Limit</Badge> : null}
      </div>
    </section>
  );
}

/** Academic structures a rule offers, for readers with no chooser of their own. */
function StructureOptions({
  condition,
}: {
  condition: RequirementTreeCondition;
}) {
  const options = condition.options.filter(
    (option) => option.kind !== "course",
  );
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="text-base font-semibold tracking-tight">
        {conditionHeading(condition)}
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {conditionInterpretation(condition)}
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <li key={`${option.kind}-${option.code}`}>
            <Link
              href={`/structures/${encodeURIComponent(option.code)}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-foreground/20 hover:bg-muted/40 motion-reduce:transition-none"
            >
              <span className="min-w-0">
                <span className="font-mono text-sm font-semibold">
                  {option.code}
                </span>
                {option.title ? (
                  <span className="ml-2 text-muted-foreground">
                    {option.title}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RequirementCondition({
  condition,
  context,
}: {
  condition: RequirementTreeCondition;
  context: TreeContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const showProgress = context.showPlanProgress !== false;
  if (
    condition.conditionKind === "units_total" &&
    condition.minimumUnits === context.unitTarget &&
    condition.maximumUnits === null
  )
    return null;
  if (condition.conditionKind === "structure_set") {
    if (!context.showStructureOptions) return null;
    return condition.options.some((option) => option.kind !== "course") ? (
      <StructureOptions condition={condition} />
    ) : (
      <StatedCondition condition={condition} />
    );
  }
  const options = condition.options.filter(
    (option) => option.kind === "course",
  );
  const progress = context.progress.get(requirementNodeKey(condition));
  const measurable = progress && progress.state !== "unmeasured";
  const units = unitsDescription(
    condition.minimumUnits,
    condition.maximumUnits,
  );
  if (options.length === 0) return <StatedCondition condition={condition} />;
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
  const caption = !showProgress
    ? null
    : target !== null
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
      {!showProgress ? null : target !== null && target > 0 ? (
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
      {showProgress && progress?.state === "over_limit" && (
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
