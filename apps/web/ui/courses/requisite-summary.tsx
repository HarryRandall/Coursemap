"use client";
import { badgeVariantForTone } from "@/lib/ui";
import { Badge } from "@coursemap/ui/components/badge";
import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import {
  type RequisiteCondition,
  type RequisiteExpression,
  type RequisiteProgress,
} from "@/lib/coursemap/requisite-summary";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import { requisiteConditionNode } from "@/lib/coursemap/requisite-tree";
import {
  conditionHeading,
  conditionInterpretation,
  conditionTone,
} from "@/ui/requirements/requirement-presentation";
import { CourseReferenceText } from "@/ui/courses/course-reference";

export function RequisiteConditionText({
  academicYear,
  condition,
  availableCourseCodes,
}: {
  academicYear: number;
  condition: RequisiteCondition;
  availableCourseCodes: ReadonlySet<string>;
}) {
  if (condition.kind === "course") {
    return (
      <>
        Complete{" "}
        <CourseReferenceText
          academicYear={academicYear}
          text={condition.code}
          availableCourseCodes={availableCourseCodes}
        />
      </>
    );
  }
  if (condition.kind === "level_units") {
    return (
      <>
        Complete at least {condition.units} units of {condition.level}-level
        {condition.subject ? ` ${condition.subject}` : ""} courses
      </>
    );
  }
  if (condition.kind === "units_total") {
    return <>Complete at least {condition.units} units of study</>;
  }
  if (condition.kind === "programme_enrolment") {
    return (
      <>
        Be enrolled in {condition.name}{" "}
        <span className="font-mono font-semibold">({condition.code})</span>
      </>
    );
  }
  return (
    <>
      Complete at least {condition.units} units of {condition.subject}-coded
      courses
    </>
  );
}
export function RequisiteExpressionSummary({
  academicYear,
  expression,
  availableCourseCodes,
}: {
  academicYear: number;
  expression: RequisiteExpression;
  availableCourseCodes: ReadonlySet<string>;
}) {
  if (expression.kind !== "group") {
    return (
      <RequisiteConditionText
        academicYear={academicYear}
        condition={expression}
        availableCourseCodes={availableCourseCodes}
      />
    );
  }

  const title =
    expression.operator === "all_of"
      ? "Complete all of the following"
      : "Complete one of the following";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-semibold text-foreground/90">{title}</p>
      <ul className="mt-2 space-y-2 border-l border-border pl-3 text-xs text-foreground/80">
        {expression.conditions.map((condition, index) => (
          <li key={index}>
            <RequisiteExpressionSummary
              academicYear={academicYear}
              expression={condition}
              availableCourseCodes={availableCourseCodes}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
export function RequisiteProgressSummary({
  academicYear,
  progress,
  availableCourseCodes,
}: {
  academicYear: number;
  progress: RequisiteProgress;
  availableCourseCodes: ReadonlySet<string>;
}) {
  if (progress.kind === "course") {
    return (
      <div className="flex items-start gap-2">
        {progress.satisfied ? (
          <CheckCircle2
            aria-label="Completed"
            className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300"
            size={16}
          />
        ) : (
          <Circle
            aria-label="Not completed"
            className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
            size={16}
          />
        )}
        <span>
          Complete{" "}
          <CourseReferenceText
            academicYear={academicYear}
            text={progress.code}
            availableCourseCodes={availableCourseCodes}
          />
        </span>
      </div>
    );
  }

  if (
    progress.kind === "subject_units" ||
    progress.kind === "level_units" ||
    progress.kind === "units_total"
  ) {
    const description =
      progress.kind === "subject_units"
        ? `${progress.subject}-coded units completed`
        : progress.kind === "level_units"
          ? `${progress.level}-level${progress.subject ? ` ${progress.subject}` : ""} units completed`
          : "units of study completed";
    return (
      <div className="flex items-start gap-2">
        {progress.satisfied ? (
          <CheckCircle2
            aria-label="Completed"
            className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300"
            size={16}
          />
        ) : (
          <Circle
            aria-label="Not completed"
            className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
            size={16}
          />
        )}
        <span>
          {progress.completedUnits} of {progress.requiredUnits} {description}
        </span>
      </div>
    );
  }

  if (progress.kind === "programme_enrolment") {
    return (
      <div className="flex items-start gap-2">
        {progress.satisfied ? (
          <CheckCircle2
            aria-label="Enrolled"
            className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300"
            size={16}
          />
        ) : (
          <Circle
            aria-label="Not enrolled"
            className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
            size={16}
          />
        )}
        <span>
          Be enrolled in {progress.name}{" "}
          <span className="font-mono font-semibold">({progress.code})</span>
        </span>
      </div>
    );
  }

  const title =
    progress.operator === "all_of"
      ? "Complete all of the following"
      : "Complete one of the following";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground/90">{title}</p>
        <Badge
          variant={
            badgeVariantForTone[progress.satisfied ? "success" : "warning"]
          }
        >
          {progress.satisfied ? "Met" : "Not met"}
        </Badge>
      </div>
      <ul className="mt-3 space-y-2 border-l border-border pl-3 text-xs text-foreground/80">
        {progress.conditions.map((condition, index) => (
          <li key={index}>
            <RequisiteProgressSummary
              academicYear={academicYear}
              progress={condition}
              availableCourseCodes={availableCourseCodes}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A requisite rule read through the shared requirement vocabulary. The narrow
 * summary above covers the handful of kinds it was written for and returns
 * nothing for the rest, which used to leave the reader with the ANU prose
 * alone. Course codes stay linked, so this loses nothing the prose carried.
 */
export function RequisiteRuleSummary({
  academicYear,
  expression,
  availableCourseCodes,
}: {
  academicYear: number;
  expression: CourseRuleExpression;
  availableCourseCodes: ReadonlySet<string>;
}) {
  if (expression.kind === "group") {
    const title =
      expression.operator === "all_of"
        ? "Complete all of the following"
        : expression.operator === "any_of"
          ? "Complete one of the following"
          : `Complete at least ${expression.minimumCount ?? 1} of the following`;
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold text-foreground/90">{title}</p>
        <ul className="mt-2 space-y-2 border-l border-border pl-3 text-xs text-foreground/80">
          {expression.conditions.map((condition, index) => (
            <li key={index}>
              <RequisiteRuleSummary
                academicYear={academicYear}
                expression={condition}
                availableCourseCodes={availableCourseCodes}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const condition = requisiteConditionNode(expression);
  const tone = conditionTone(condition);
  const optionCodes = condition.options
    .filter((option) => option.kind === "course")
    .map((option) => option.code);
  return (
    <div className="flex items-start gap-2">
      {tone === "warning" ? (
        <CircleAlert
          aria-label="Incompatible"
          className="mt-0.5 shrink-0 text-warning"
          size={16}
        />
      ) : null}
      <div className="min-w-0">
        <p>
          <span className="font-semibold text-foreground/90">
            {conditionHeading(condition)}
          </span>
          {" · "}
          <CourseReferenceText
            academicYear={academicYear}
            text={conditionInterpretation(condition)}
            availableCourseCodes={availableCourseCodes}
          />
        </p>
        {optionCodes.length ? (
          <p className="mt-1 text-muted-foreground">
            <CourseReferenceText
              academicYear={academicYear}
              text={optionCodes.join(", ")}
              availableCourseCodes={availableCourseCodes}
            />
          </p>
        ) : null}
      </div>
    </div>
  );
}
