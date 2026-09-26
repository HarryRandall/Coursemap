"use client";
import type {
  RequisiteCondition,
  RequisiteExpression,
} from "@/lib/coursemap/requisite-summary";
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
