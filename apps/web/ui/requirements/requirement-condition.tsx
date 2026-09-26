"use client";
import { useId, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Info,
  SquareDashed,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import { requirementCourseHeading } from "@/lib/coursemap/requirement-display";
import { isCatalogueKind } from "@/lib/catalogue/content";
import { publicCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import { cn } from "@/lib/cn";
import {
  conditionHeading,
  conditionInterpretation,
  conditionSummary,
  conditionTone,
  hidesCondition,
  listedCourseCounts,
  requirementRowStatus,
  unitsDescription,
} from "@/ui/requirements/requirement-presentation";
import type {
  RequirementRowStatus,
  RequirementTreeCondition,
  TreeContext,
} from "@/ui/requirements/requirement-presentation";
import { RequirementCourseOptions } from "./requirement-course-options";
import { UnitsBar } from "@/ui/requirements/units-bar";

/** The courses a rule holds, and any a degree-wide cap turned away. */
function CountedCourses({
  condition,
  context,
  tone,
}: {
  condition: RequirementTreeCondition;
  context: TreeContext;
  tone: "progress" | "limit" | "over_limit";
}) {
  const key = requirementNodeKey(condition);
  const progress = context.progress.get(key);
  if (!context.placement || !progress || progress.state === "unmeasured") {
    return null;
  }
  const overCap = [...context.placement.allocation]
    .filter(([, placement]) => placement.overCapKey === key)
    .map(([code]) => code);
  return (
    <div className="flex flex-col gap-3">
      <UnitsBar
        completed={progress.completedUnits}
        planned={progress.plannedUnits}
        goal={progress.targetUnits ?? progress.maximumUnits}
        tone={tone}
      />
      {progress.matchedCourseCodes.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Counting here">
          {progress.matchedCourseCodes.map((code) => (
            <CourseChip
              key={code}
              code={code}
              status={context.attemptStatusByCode.get(code)}
            />
          ))}
        </ul>
      ) : null}
      {overCap.length ? (
        <p className="text-xs text-destructive">
          Over this limit, so counting towards nothing: {overCap.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

/** A course counting towards a rule: filled with a check once completed, dashed while planned. */
function CourseChip({
  code,
  status,
}: {
  code: string;
  status: "completed" | "planned" | "enrolled" | undefined;
}) {
  const completed = status === "completed";
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold",
        completed
          ? "border-success/30 bg-success/10 text-success"
          : "border-dashed border-border",
      )}
    >
      {completed ? <Check className="size-3" aria-hidden="true" /> : null}
      {code}
      <span className="sr-only">
        {completed ? " completed" : status ? ` ${status}` : ""}
      </span>
    </li>
  );
}

/** Rules that read every course the degree counts rather than using any up. */
function spansDegree(condition: RequirementTreeCondition) {
  return (
    condition.scope === "degree" ||
    (condition.maximumUnits !== null &&
      condition.minimumUnits === null &&
      condition.minimumCourses === null)
  );
}

/** A glyph beside each rule that repeats its status pill in shape. */
function StatusGlyph({ status }: { status: RequirementRowStatus }) {
  const className = "mt-0.5 size-4 shrink-0";
  switch (status.kind) {
    case "complete":
      return (
        <CircleCheck
          className={cn(className, "text-success")}
          aria-hidden="true"
        />
      );
    case "planned":
      return (
        <CircleDashed
          className={cn(className, "text-success")}
          aria-hidden="true"
        />
      );
    case "limit":
      return (
        <SquareDashed
          className={cn(className, "text-muted-foreground")}
          aria-hidden="true"
        />
      );
    case "over_limit":
      return (
        <SquareDashed
          className={cn(className, "text-destructive")}
          aria-hidden="true"
        />
      );
    default:
      return (
        <Circle
          className={cn(className, "text-muted-foreground/70")}
          aria-hidden="true"
        />
      );
  }
}

const statusBadge = {
  todo: "warning-light",
  planned: "outline",
  complete: "success-light",
  limit: "outline",
  over_limit: "destructive-light",
} as const;

/** The count against the target and a short status, at the right of a rule. */
function StatusSummary({ status }: { status: RequirementRowStatus }) {
  if (status.kind === "unmeasured") return null;
  const figure = status.figure;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
      {figure ? (
        <span className="text-sm text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground">{figure.value}</span>
          {figure.maximum ? " of max " : " / "}
          {figure.target}{" "}
          {figure.unit === "courses"
            ? figure.target === 1
              ? "course"
              : "courses"
            : "units"}
        </span>
      ) : null}
      <Badge
        variant={statusBadge[status.kind]}
        className={cn(status.kind === "limit" && "border-dashed")}
      >
        {status.kind === "complete" ? (
          <Check className="size-3" aria-hidden="true" />
        ) : null}
        {status.label}
      </Badge>
    </div>
  );
}

/** A rule with no course list of its own: units, levels, tags and electives. */
function StatedCondition({
  condition,
  context,
}: {
  condition: RequirementTreeCondition;
  context?: TreeContext;
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
  const showProgress = context && context.showPlanProgress !== false;
  const status: RequirementRowStatus = showProgress
    ? requirementRowStatus(condition, context)
    : { kind: "unmeasured" };
  // The summary leads with how much is needed; the category only follows it
  // when the summary does not already name it.
  const title = conditionSummary(condition);
  const heading = conditionHeading(condition);
  const detail = [
    title.toLowerCase().includes(heading.toLowerCase()) ? null : heading,
    showProgress ? null : interpretation,
    spansDegree(condition) ? "Counts across the whole degree" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        {showProgress ? <StatusGlyph status={status} /> : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-medium tracking-tight">{title}</h3>
          {detail ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
          ) : null}
        </div>
        <StatusSummary status={status} />
      </div>
      {showProgress ? (
        <div className="mt-3 pl-7">
          <CountedCourses
            condition={condition}
            context={context}
            tone={
              status.kind === "over_limit"
                ? "over_limit"
                : status.kind === "limit"
                  ? "limit"
                  : "progress"
            }
          />
        </div>
      ) : null}
    </section>
  );
}

/** Academic structures a rule offers, for readers with no chooser of their own. */
function StructureOptions({
  condition,
  academicYear,
}: {
  condition: RequirementTreeCondition;
  academicYear: number | null;
}) {
  const options = condition.options.filter(
    (option) => option.kind !== "course",
  );
  return (
    <section className="px-4 py-4 sm:px-5">
      <h3 className="text-[15px] font-medium tracking-tight">
        {conditionHeading(condition)}
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {conditionInterpretation(condition)}
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const name = (
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
          );
          // Every catalogue page is addressed by year. Without one there is no
          // page to send the reader to, so the option reads as plain text.
          const href =
            academicYear !== null && isCatalogueKind(option.kind)
              ? publicCatalogueRecordPath(
                  option.kind,
                  academicYear,
                  option.code,
                )
              : null;
          return (
            <li key={`${option.kind}-${option.code}`}>
              {href ? (
                <Link
                  href={href}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-foreground/20 hover:bg-muted/40 motion-reduce:transition-none"
                >
                  {name}
                </Link>
              ) : (
                <span className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  {name}
                </span>
              )}
            </li>
          );
        })}
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
  if (hidesCondition(condition, context)) return null;
  if (condition.conditionKind === "structure_set") {
    return condition.options.some((option) => option.kind !== "course") ? (
      <StructureOptions
        academicYear={context.catalogue.academicYear}
        condition={condition}
      />
    ) : (
      <StatedCondition condition={condition} />
    );
  }
  if (!condition.options.some((option) => option.kind === "course")) {
    return <StatedCondition condition={condition} context={context} />;
  }
  const progress = context.progress.get(requirementNodeKey(condition));
  const units = unitsDescription(
    condition.minimumUnits,
    condition.maximumUnits,
  );
  const { codes, required, done, planned } = listedCourseCounts(
    condition,
    context,
  );
  const status: RequirementRowStatus = showProgress
    ? requirementRowStatus(condition, context)
    : { kind: "unmeasured" };
  const target = condition.minimumCourses;
  return (
    <section className="relative px-4 py-4 transition-colors has-[button[data-section-toggle]:focus-visible]:ring-2 has-[button[data-section-toggle]:focus-visible]:ring-ring has-[button[data-section-toggle]:focus-visible]:ring-inset has-[button[data-section-toggle]:hover]:bg-muted/30 motion-reduce:transition-none sm:px-5">
      <div className="group flex items-start gap-3">
        {showProgress ? <StatusGlyph status={status} /> : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-medium tracking-tight">
            <button
              type="button"
              data-section-toggle
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-controls={panelId}
              className="text-left outline-none after:absolute after:inset-0 after:cursor-pointer"
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
            {condition.includesAnyCourse
              ? " · any other ANU course counts too"
              : ""}
          </p>
        </div>
        <StatusSummary status={status} />
        <ChevronDown
          aria-hidden="true"
          className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
        />
      </div>
      {!showProgress ? null : target !== null && target > 0 ? (
        <UnitsBar
          completed={done}
          planned={planned}
          goal={target}
          className="mt-3 ml-7 w-auto"
        />
      ) : progress && progress.state !== "unmeasured" ? (
        <UnitsBar
          completed={progress.completedUnits}
          planned={progress.plannedUnits}
          goal={progress.targetUnits ?? progress.maximumUnits}
          tone={progress.state === "over_limit" ? "over_limit" : "progress"}
          className="mt-3 ml-7 w-auto"
        />
      ) : null}
      {showProgress && progress?.state === "over_limit" && (
        <p className="mt-2 pl-7 text-xs text-destructive">
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
