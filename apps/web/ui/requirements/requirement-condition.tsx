"use client";

import { RequirementOverrideControl } from "./requirement-override-control";
import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import {
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
import {
  conditionTone,
  hidesCondition,
} from "@/lib/coursemap/requirement-classification";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import { cn } from "@/lib/cn";
import {
  conditionHeading,
  conditionInterpretation,
  conditionSummary,
  courseListTitle,
  formattedNoteText,
  listedCourseCounts,
  repeatAllowancesByCode,
  requirementRowStatus,
  restates,
  unitsDescription,
} from "@/ui/requirements/requirement-presentation";
import type {
  RequirementRowStatus,
  RequirementTreeCondition,
  TreeContext,
} from "@/ui/requirements/requirement-presentation";
import { RequirementCourseOptions } from "./requirement-course-options";
import { MatchingCourses } from "./matching-courses";
import { StructureOptions } from "@/ui/requirements/structure-options";
import { UnitsBar } from "@/ui/requirements/units-bar";
import { CatalogueMarkdown } from "@/ui/common/catalogue-markdown";

/**
 * A course counting towards a rule, marked by its border alone: solid green
 * once completed and dashed purple while planned, so the dash carries the
 * difference as well as the colour. Under a cap, completed courses are grey,
 * since they use up room rather than make progress.
 */
function CourseChip({
  code,
  status,
  limit = false,
}: {
  code: string;
  status: "completed" | "planned" | "enrolled" | undefined;
  limit?: boolean;
}) {
  const completed = status === "completed";
  return (
    <li
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums",
        completed
          ? limit
            ? "border-muted-foreground/40"
            : "border-success/60"
          : status
            ? "border-dashed border-primary/60"
            : "border-border",
      )}
    >
      {code}
      <span className="sr-only">
        {completed ? " completed" : status ? ` ${status}` : ""}
      </span>
    </li>
  );
}

/** The courses a rule holds, and any a degree-wide cap turned away. */
function CountedCourses({
  condition,
  context,
  limit = false,
}: {
  condition: RequirementTreeCondition;
  context: TreeContext;
  limit?: boolean;
}) {
  const key = requirementNodeKey(condition);
  const progress = context.progress.get(key);
  if (!context.placement || !progress || progress.state === "unmeasured") {
    return null;
  }
  const overCap = [...context.placement.allocation]
    .filter(([, placement]) => placement.overCapKey === key)
    .map(([code]) => code);
  if (!progress.matchedCourseCodes.length && !overCap.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {progress.matchedCourseCodes.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Counting here">
          {progress.matchedCourseCodes.map((code) => (
            <CourseChip
              key={code}
              code={code}
              status={context.attemptStatusByCode.get(code)}
              limit={limit}
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

/** Rules that read every course the degree counts rather than using any up. */
function spansDegree(condition: RequirementTreeCondition) {
  return condition.scope === "degree";
}

/** A glyph beside each rule that gives its status a shape as well as a colour. */
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
          className={cn(className, "text-primary")}
          aria-hidden="true"
        />
      );
    case "limit":
    case "over_limit":
      return (
        <SquareDashed
          className={cn(
            className,
            status.kind === "limit"
              ? "text-muted-foreground"
              : "text-destructive",
          )}
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

/**
 * The count against the target. What is left is plain from the count, so
 * the status is in words for screen readers only, except a broken limit,
 * which needs saying.
 */
function StatusSummary({ status }: { status: RequirementRowStatus }) {
  if (status.kind === "unmeasured") return null;
  const figure = status.figure;
  return (
    <div className="flex shrink-0 items-center gap-2">
      {figure ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground">
            {figure.maximum
              ? figure.value
              : Math.min(figure.value, figure.target)}
          </span>
          {figure.maximum ? " of max " : " / "}
          {figure.target}{" "}
          {figure.unit === "courses"
            ? figure.target === 1
              ? "course"
              : "courses"
            : "units"}
        </span>
      ) : null}
      {status.kind === "over_limit" ? (
        <Badge variant="destructive-light">{status.label}</Badge>
      ) : (
        <span className="sr-only">{status.label}</span>
      )}
    </div>
  );
}

/**
 * Which rules are open, kept above the rows. A rule moves between sections
 * when a course is placed elsewhere, and a row that kept its own state would
 * close under the student as it moved.
 */
export const OpenRulesContext = createContext<{
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
} | null>(null);

/**
 * One rule as a compact row: its status, what it asks for and how far along
 * it is. What sits behind it, the courses counting towards it or the options
 * it offers, stays folded away until the row is opened.
 */
function RuleRow({
  ruleKey,
  overrideControl,
  status,
  title,
  badge,
  detail,
  bar,
  children,
}: {
  ruleKey: string;
  overrideControl?: ReactNode;
  status: RequirementRowStatus | null;
  title: string;
  /** A word beside the title, for a kind of rule the status cannot show. */
  badge?: string | null;
  detail?: ReactNode;
  bar?: ReactNode;
  children?: ReactNode;
}) {
  const openRules = useContext(OpenRulesContext);
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = openRules ? openRules.isOpen(ruleKey) : localExpanded;
  const setExpanded = (next: boolean) =>
    openRules ? openRules.toggle(ruleKey) : setLocalExpanded(next);
  const panelId = useId();
  const expandable = Boolean(children);
  return (
    <section className="relative px-4 py-3 transition-colors has-[button[data-section-toggle]:focus-visible]:ring-2 has-[button[data-section-toggle]:focus-visible]:ring-ring has-[button[data-section-toggle]:focus-visible]:ring-inset has-[button[data-section-toggle]:hover]:bg-muted/30 motion-reduce:transition-none sm:px-5">
      <div className="group flex items-start gap-3">
        {status ? <StatusGlyph status={status} /> : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">
            {expandable ? (
              <button
                type="button"
                data-section-toggle
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="text-left outline-none after:absolute after:inset-0 after:cursor-pointer"
              >
                {title}
                <span className="sr-only">
                  {" "}
                  · {expanded ? "Hide courses" : "View courses"}
                </span>
              </button>
            ) : (
              title
            )}
            {badge ? (
              <Badge variant="outline" className="ml-2 align-middle">
                {badge}
              </Badge>
            ) : null}
          </h3>
          {detail ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
          ) : null}
        </div>
        {overrideControl}
        {status ? <StatusSummary status={status} /> : null}
        {expandable ? (
          <ChevronDown
            aria-hidden="true"
            className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
        ) : null}
      </div>
      {/* A finished rule's tick says it all; a full bar would only repeat it. */}
      {bar && status?.kind !== "complete" ? (
        <div className="mt-2 pl-7">{bar}</div>
      ) : null}
      {expandable ? (
        <div id={panelId} hidden={!expanded} className="relative z-10">
          {expanded ? <div className="mt-3">{children}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function barTone(status: RequirementRowStatus) {
  return status.kind === "over_limit"
    ? "over_limit"
    : status.kind === "limit"
      ? "limit"
      : "progress";
}

/** A rule with no course list of its own: units, levels, tags and electives. */
function StatedCondition({
  condition,
  context,
  note,
}: {
  condition: RequirementTreeCondition;
  context?: TreeContext;
  note?: string;
}) {
  const tone =
    context?.progress.get(requirementNodeKey(condition))?.state ===
    "done-by-override"
      ? "requirement"
      : conditionTone(condition);
  const selector = context?.unitPool === true;
  const displayedCondition = selector
    ? { ...condition, minimumUnits: null }
    : condition;
  const interpretation =
    conditionInterpretation(displayedCondition) || condition.freeText;
  if (tone === "warning" || tone === "note") {
    const formatted = tone === "note" ? formattedNoteText(condition) : null;
    return (
      <Alert variant={tone === "warning" ? "warning" : "default"}>
        {tone === "warning" ? (
          <CircleAlert aria-hidden="true" />
        ) : (
          <Info aria-hidden="true" />
        )}
        <AlertTitle>{conditionHeading(condition)}</AlertTitle>
        <AlertDescription>
          {context?.catalogue.academicYear && formatted ? (
            <CatalogueMarkdown
              markdown={formatted}
              academicYear={context.catalogue.academicYear}
              availableCourseCodes={
                new Set(context.catalogue.courses.map((course) => course.code))
              }
            />
          ) : (
            interpretation
          )}
        </AlertDescription>
        {context?.structureCode && context.showPlanProgress !== false ? (
          <RequirementOverrideControl
            structureCode={context.structureCode}
            requirementKey={condition.projectionKey}
          />
        ) : null}
      </Alert>
    );
  }
  const showProgress = context && context.showPlanProgress !== false;
  const status =
    showProgress && !selector ? requirementRowStatus(condition, context) : null;
  const progress = context?.progress.get(requirementNodeKey(condition));
  // The summary leads with how much is needed; the category only follows it
  // when the summary does not already name it.
  const title = conditionSummary(
    displayedCondition,
    context?.catalogue.courses.filter(
      (course) => course.year === context.catalogue.academicYear,
    ),
  );
  const heading = conditionHeading(
    condition,
    context?.catalogue.courses.filter(
      (course) => course.year === context.catalogue.academicYear,
    ),
  );
  const detail = [
    title.toLowerCase().includes(heading.toLowerCase()) ? null : heading,
    showProgress || restates(title, interpretation) ? null : interpretation,
    selector
      ? "Counts towards the combined requirement"
      : spansDegree(condition)
        ? "Counts across the whole degree"
        : null,
    note,
  ]
    .filter(Boolean)
    .join(" · ");
  const counted =
    showProgress && context ? (
      <CountedCourses
        condition={condition}
        context={context}
        limit={status?.kind === "limit" || status?.kind === "over_limit"}
      />
    ) : null;
  const suggestions =
    context &&
    ["subject_units", "level_units", "tagged_units", "elective_units"].includes(
      condition.conditionKind,
    ) ? (
      <MatchingCourses condition={condition} context={context} />
    ) : null;
  return (
    <RuleRow
      ruleKey={requirementNodeKey(condition)}
      overrideControl={
        context?.structureCode && context.showPlanProgress !== false ? (
          <RequirementOverrideControl
            structureCode={context.structureCode}
            requirementKey={condition.projectionKey}
          />
        ) : null
      }
      status={status}
      title={title}
      badge={
        !status && tone === "limit" && !context?.limitsStage ? "Limit" : null
      }
      detail={detail}
      bar={
        status && progress && progress.state !== "unmeasured" ? (
          <UnitsBar
            completed={progress.completedUnits}
            planned={progress.plannedUnits}
            goal={progress.targetUnits ?? progress.maximumUnits}
            tone={barTone(status)}
          />
        ) : null
      }
    >
      {counted || suggestions ? (
        <div className="flex flex-col gap-3 pl-7">
          {counted}
          {suggestions}
        </div>
      ) : null}
    </RuleRow>
  );
}

export function RequirementCondition({
  condition,
  context,
  note,
}: {
  condition: RequirementTreeCondition;
  context: TreeContext;
  /** A line about the rule's other options, such as those this view leaves out. */
  note?: string;
}) {
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
    return (
      <StatedCondition condition={condition} context={context} note={note} />
    );
  }
  const showProgress = context.showPlanProgress !== false;
  const progress = context.progress.get(requirementNodeKey(condition));
  const units = unitsDescription(
    condition.minimumUnits,
    condition.maximumUnits,
  );
  const { codes, required, done, planned } = listedCourseCounts(
    condition,
    context,
  );
  const status = showProgress ? requirementRowStatus(condition, context) : null;
  const target = condition.minimumCourses;
  const title = courseListTitle(
    condition,
    codes,
    required,
    context.catalogue.courses.filter(
      (course) => course.year === context.catalogue.academicYear,
    ),
  );
  // Only what the title does not already say, such as "Pick 3 of 9 courses".
  const detail = [
    units && !restates(title, units) ? units : null,
    restates(title, `${codes.length} courses`)
      ? null
      : `${codes.length} ${required ? (codes.length === 1 ? "course" : "courses") : "options"}`,
    condition.includesAnyCourse ? "any other ANU course counts too" : null,
    note,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <RuleRow
      ruleKey={requirementNodeKey(condition)}
      overrideControl={
        context?.structureCode && context.showPlanProgress !== false ? (
          <RequirementOverrideControl
            structureCode={context.structureCode}
            requirementKey={condition.projectionKey}
          />
        ) : null
      }
      status={status}
      title={title}
      detail={
        <>
          {detail}
          {showProgress && progress?.state === "over_limit" ? (
            <span className="text-destructive">
              {" "}
              · Above this requirement&apos;s limit
            </span>
          ) : null}
        </>
      }
      bar={
        !status ? null : target !== null && target > 0 ? (
          <UnitsBar completed={done} planned={planned} goal={target} />
        ) : progress && progress.state !== "unmeasured" ? (
          <UnitsBar
            completed={progress.completedUnits}
            planned={progress.plannedUnits}
            goal={progress.targetUnits ?? progress.maximumUnits}
            tone={barTone(status)}
          />
        ) : null
      }
    >
      <RequirementCourseOptions
        codes={codes}
        required={required}
        context={context}
        repeatUnitsByCode={repeatAllowancesByCode(condition)}
      />
      {condition.includesAnyCourse ? (
        <MatchingCourses condition={condition} context={context} />
      ) : null}
    </RuleRow>
  );
}
