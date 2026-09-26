import Link from "next/link";
import { Check, CircleSlash, Info, KeyRound, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  evaluateRule,
  groupRequiredCount,
  type ConditionEvaluation,
  type RequisiteStatus,
  type StudentRecord,
} from "@/lib/coursemap/requisite-evaluation";
import type { CourseRuleCondition } from "@/lib/coursemap/requisite-tree";
import {
  groupSentence,
  requisiteNoun,
  requisiteSentence,
  splitRequisiteRule,
} from "@/ui/courses/requisite-wording";

type Group = Extract<CourseRuleExpression, { kind: "group" }>;
type Marker = RequisiteStatus | "permission" | "note" | "blocked";
type ChipState = "done" | "enrolled" | "todo";

type Step = {
  title: string;
  marker: Marker;
  counted: boolean;
  body: ReactNode;
};

function Chip({
  code,
  state,
  href,
}: {
  code: string;
  state: ChipState;
  href: string | null;
}) {
  const className = cn(
    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold",
    state === "done"
      ? "border-success/40 bg-success/10 text-success"
      : state === "enrolled"
        ? "border-primary/40 bg-primary/10 text-primary"
        : href
          ? "border-border bg-card text-primary hover:border-primary/50"
          : "border-border bg-muted/40 text-muted-foreground",
  );
  const content = (
    <>
      {state === "done" ? (
        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
      ) : null}
      {state === "enrolled" ? (
        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
      ) : null}
      {code}
      {state === "done" ? <span className="sr-only"> (done)</span> : null}
      {state === "enrolled" ? (
        <span className="sr-only"> (enrolled this semester)</span>
      ) : null}
    </>
  );
  return href ? (
    <Link href={href} prefetch={false} className={className}>
      {content}
    </Link>
  ) : (
    <span className={className}>{content}</span>
  );
}

function UnitsBar({ value, target }: { value: number; target: number }) {
  const met = value >= target;
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(value, target)}
        aria-label="Units completed"
        className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/20"
      >
        <div
          className={cn(
            "h-full rounded-full",
            met ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${Math.min(100, (value / target) * 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">
          {value}
        </span>{" "}
        of <span className="tabular-nums">{target}</span> units
        {met ? " · done" : ` · ${target - value} to go`}
      </p>
    </div>
  );
}

function ScoreScale({
  value,
  threshold,
  scale,
}: {
  value: number;
  threshold: number;
  scale: "wam" | "gpa";
}) {
  const max = scale === "wam" ? 100 : 7;
  const digits = 1;
  const at = (n: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;
  const met = value >= threshold;
  const label = scale === "wam" ? "WAM" : "GPA";
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <div className="relative mt-5 h-1.5 rounded-full bg-muted-foreground/20">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            met ? "bg-success" : "bg-warning",
          )}
          style={{ width: at(value) }}
        />
        <div
          aria-hidden="true"
          className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-foreground/70"
          style={{ left: at(threshold) }}
        />
        <span
          aria-hidden="true"
          className="absolute -top-5.5 -translate-x-1/2 text-[10px] font-semibold whitespace-nowrap text-foreground/80"
          style={{ left: at(threshold) }}
        >
          {threshold.toFixed(digits)} needed
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Your {label} is{" "}
        <span
          className={cn(
            "font-medium tabular-nums",
            met ? "text-success" : "text-warning",
          )}
        >
          {value.toFixed(digits)}
        </span>
        {met ? "" : ` · ${(threshold - value).toFixed(digits)} below`}
      </p>
    </div>
  );
}

function StateLine({ met, text }: { met: boolean; text: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs",
        met ? "text-success" : "text-warning",
      )}
    >
      {met ? (
        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
      ) : (
        <X className="size-3.5" strokeWidth={3} aria-hidden="true" />
      )}
      {text}
    </p>
  );
}

function MarkerIcon({ marker, index }: { marker: Marker; index: number }) {
  const base =
    "relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold";
  if (marker === "met")
    return (
      <span className={cn(base, "bg-success text-white")}>
        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        <span className="sr-only">Met</span>
      </span>
    );
  if (marker === "partial")
    return (
      <span
        className={cn(
          base,
          "border-2 border-warning bg-background text-warning",
        )}
      >
        {index}
        <span className="sr-only">, partly met</span>
      </span>
    );
  if (marker === "permission")
    return (
      <span className={cn(base, "bg-warning/15 text-warning")}>
        <KeyRound className="size-3.5" aria-hidden="true" />
      </span>
    );
  if (marker === "note")
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Info className="size-3.5" aria-hidden="true" />
      </span>
    );
  if (marker === "blocked")
    return (
      <span className={cn(base, "bg-warning/15 text-warning")}>
        <CircleSlash className="size-3.5" aria-hidden="true" />
      </span>
    );
  return (
    <span
      className={cn(base, "border border-border bg-card text-muted-foreground")}
    >
      {index}
    </span>
  );
}

const CHIP_ORDER: Record<ChipState, number> = { done: 0, enrolled: 1, todo: 2 };

/** Done first, then this semester's, so progress reads left to right. */
function sortChips<T extends { state: ChipState }>(chips: T[]) {
  return [...chips].sort(
    (left, right) => CHIP_ORDER[left.state] - CHIP_ORDER[right.state],
  );
}

function courseState(code: string, student: StudentRecord | null): ChipState {
  if (!student) return "todo";
  if (student.completed.has(code)) return "done";
  if (student.enrolled.has(code)) return "enrolled";
  return "todo";
}

export function EnrolmentSteps({
  academicYear,
  availableCourseCodes,
  expression,
  student,
}: {
  academicYear: number;
  availableCourseCodes: ReadonlySet<string>;
  expression: CourseRuleExpression;
  /** Null when signed out: the steps show, the progress does not. */
  student: StudentRecord | null;
}) {
  const { requirements, permissions, notes, incompatible } =
    splitRequisiteRule(expression);
  const href = (code: string) =>
    availableCourseCodes.has(code)
      ? `/courses/${academicYear}/${code.toLowerCase()}`
      : null;
  const evaluate = (node: CourseRuleExpression): ConditionEvaluation | null =>
    student ? evaluateRule(node, student) : null;

  const courseChips = (list: readonly string[]) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {sortChips(
        list.map((code) => ({ code, state: courseState(code, student) })),
      ).map((chip) => (
        <Chip
          key={chip.code}
          code={chip.code}
          state={chip.state}
          href={href(chip.code)}
        />
      ))}
    </div>
  );

  const conditionBody = (
    condition: CourseRuleCondition,
    result: ConditionEvaluation | null,
  ): ReactNode => {
    const measure = result?.measure;
    switch (condition.kind) {
      case "course":
        return (
          <>
            {courseChips([condition.code])}
            {result?.detail ? (
              <StateLine met={result.status === "met"} text={result.detail} />
            ) : null}
          </>
        );
      case "course_set_units":
        return (
          <>
            {courseChips(condition.courseCodes)}
            {measure?.kind === "units" ? (
              <UnitsBar value={measure.value} target={measure.target} />
            ) : null}
          </>
        );
      case "units_total":
      case "subject_units":
      case "level_units":
        return measure?.kind === "units" ? (
          <UnitsBar value={measure.value} target={measure.target} />
        ) : null;
      case "wam":
      case "gpa":
        return measure?.kind === "score" ? (
          <ScoreScale
            value={measure.value}
            threshold={measure.threshold}
            scale={measure.scale}
          />
        ) : null;
      case "structure_set":
        return (
          <div className="flex flex-wrap gap-1.5">
            {sortChips(
              condition.structureCodes.map((code) => ({
                code,
                state: (student?.programmeCodes.includes(code)
                  ? "done"
                  : "todo") as ChipState,
              })),
            ).map((chip) => (
              <Chip
                key={chip.code}
                code={chip.code}
                state={chip.state}
                href={null}
              />
            ))}
          </div>
        );
      case "tagged_units":
      case "elective_units":
        return student ? (
          <p className="text-xs text-muted-foreground">
            Your record can&apos;t be checked against this yet.
          </p>
        ) : null;
      default:
        return result?.detail ? (
          <StateLine met={result.status === "met"} text={result.detail} />
        ) : null;
    }
  };

  const groupBody = (group: Group, result: ConditionEvaluation | null) => {
    if (group.conditions.every((child) => child.kind === "course")) {
      const needed = groupRequiredCount(group);
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {courseChips(
            group.conditions.map((child) =>
              child.kind === "course" ? child.code : "",
            ),
          )}
          {student && needed > 1 && result?.measure?.kind === "count" ? (
            <span className="ml-1 text-xs text-muted-foreground">
              {result.measure.value} of {needed} done
            </span>
          ) : null}
        </div>
      );
    }
    const choice = group.operator !== "all_of";
    return (
      <div className="flex max-w-xl flex-col">
        {group.conditions.map((child, index) => {
          const met = evaluate(child)?.status === "met";
          const lines =
            child.kind === "group"
              ? child.conditions.map((grandchild, lineIndex) =>
                  grandchild.kind === "group"
                    ? groupSentence(grandchild)
                    : `${lineIndex > 0 ? (child.operator === "all_of" ? "and " : "or ") : ""}${requisiteNoun(grandchild)}`,
                )
              : [requisiteNoun(child)];
          return (
            <div key={index}>
              {index > 0 ? (
                <div
                  aria-hidden="true"
                  className={cn(
                    "flex items-center gap-2 py-1.5 text-[10px] font-bold tracking-wider uppercase",
                    choice ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className="h-px flex-1 bg-border" />
                  {choice ? "or" : "and"}
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <div
                className={cn(
                  "rounded-lg border px-3 py-2",
                  met
                    ? "border-success/40 bg-success/5"
                    : "border-border bg-card",
                )}
              >
                <p className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
                  Option {String.fromCharCode(65 + index)}
                  {met ? (
                    <span className="flex items-center gap-1 text-success">
                      <Check
                        className="size-3.5"
                        strokeWidth={3}
                        aria-hidden="true"
                      />
                      You meet this
                    </span>
                  ) : null}
                </p>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-foreground/80">
                  {lines.map((line, lineIndex) => (
                    <li key={lineIndex}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const steps: Step[] = [
    ...requirements.map((node): Step => {
      const result = evaluate(node);
      return {
        title:
          node.kind === "group" ? groupSentence(node) : requisiteSentence(node),
        marker: result?.status ?? "unmet",
        counted: true,
        body:
          node.kind === "group"
            ? groupBody(node, result)
            : conditionBody(node, result),
      };
    }),
    ...permissions.map((text): Step => ({
      title: "Get permission to enrol",
      marker: "permission",
      counted: false,
      body: <p className="text-muted-foreground">{text}</p>,
    })),
    ...notes.map((text): Step => ({
      title: "Also required",
      marker: "note",
      counted: false,
      body: <p className="text-muted-foreground">{text}</p>,
    })),
    ...incompatible.map((code): Step => {
      const clear = student ? !student.completed.has(code) : null;
      return {
        title: `You can't take this if you've completed ${code}`,
        marker: clear === null ? "blocked" : clear ? "met" : "blocked",
        counted: student !== null,
        body:
          clear === null ? null : (
            <StateLine
              met={clear}
              text={
                clear
                  ? `You haven't completed ${code}`
                  : `You have completed ${code}`
              }
            />
          ),
      };
    }),
  ];

  if (steps.length === 0) return null;
  const counted = steps.filter((step) => step.counted);
  const met = counted.filter((step) => step.marker === "met").length;

  return (
    <div className="text-[13px]">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-6 py-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {steps.length === 1 ? "Required" : `All ${steps.length} required`}
        </p>
        {student ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80 tabular-nums">
            {met} of {counted.length} met
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Sign in to see your progress
          </span>
        )}
      </div>
      <ol className="px-6 py-5">
        {steps.map((step, index) => (
          <li key={index} className="relative flex gap-3 pb-6 last:pb-0">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-7 bottom-1 left-3 w-px bg-border"
              />
            ) : null}
            <MarkerIcon marker={step.marker} index={index + 1} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
              <p className="font-medium text-foreground">{step.title}</p>
              {step.body}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
