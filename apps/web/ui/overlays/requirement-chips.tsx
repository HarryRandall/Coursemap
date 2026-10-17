import { Check } from "lucide-react";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  evaluateRule,
  groupOperator,
  type StudentRecord,
} from "@/lib/coursemap/requisite-evaluation";
import { requisiteSentence } from "@/ui/courses/requisite-wording";
import { CodeChip } from "@/ui/common/code-chip";

/** A course code ticked once the plan covers it, crossed while it doesn't. */
export function PlanCodeChip({
  code,
  student,
}: {
  code: string;
  student: StudentRecord | null;
}) {
  const upper = code.toUpperCase();
  const tone = !student
    ? "neutral"
    : student.completed.has(upper) || student.enrolled.has(upper)
      ? "met"
      : "missing";
  return <CodeChip tone={tone}>{code}</CodeChip>;
}

function groupWord(group: Extract<CourseRuleExpression, { kind: "group" }>) {
  const operator = groupOperator(group);
  if (operator === "all_of") return "all of";
  if (operator === "any_of") return "one of";
  return `${group.minimumCount ?? 1} of`;
}

/**
 * One requirement inline: course codes as chips ticked once the plan covers
 * them, groups as "one of" or "all of" runs, and anything else as a short
 * sentence with how the plan stands against it. Without a student every chip
 * stays neutral.
 */
export function RequirementChips({
  node,
  student,
  nested = false,
}: {
  node: CourseRuleExpression;
  student: StudentRecord | null;
  nested?: boolean;
}) {
  if (node.kind === "course")
    return <PlanCodeChip code={node.code} student={student} />;
  if (node.kind === "group") {
    const children = (
      <>
        <span className="text-xs text-muted-foreground">{groupWord(node)}</span>
        {node.conditions.map((condition, index) => (
          <RequirementChips
            key={index}
            node={condition}
            student={student}
            nested
          />
        ))}
      </>
    );
    return nested ? (
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border px-1.5 py-1">
        {children}
      </span>
    ) : (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {children}
      </span>
    );
  }
  const result = student ? evaluateRule(node, student) : null;
  const met = result?.status === "met";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-foreground/85">
      {met ? (
        <Check
          size={12}
          strokeWidth={3}
          aria-label="met"
          className="text-emerald-600 dark:text-emerald-400"
        />
      ) : null}
      {requisiteSentence(node)}
      {result?.detail ? (
        <>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground">{result.detail}</span>
        </>
      ) : null}
    </span>
  );
}
