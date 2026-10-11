"use client";
import type { ReactNode } from "react";
import { ArrowRight, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { sessionShortName } from "@/lib/coursemap/academic-periods";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { PlanFixStep } from "@/lib/planner";

function stepTermId(step: PlanFixStep) {
  return step.type === "add" ? step.termId : step.toTermId;
}

/**
 * The changes a fix makes, in the order they happen in the degree, each with
 * the semester it lands in. Apply takes them; Not now closes the panel.
 */
export function ResolveSteps({
  steps,
  catalogue,
  busy,
  onApply,
  onDismiss,
  footer,
}: {
  /** Another way out, shown beneath the fix, such as taking it anyway. */
  footer?: ReactNode;
  steps: readonly PlanFixStep[];
  catalogue?: PlanCatalogue;
  busy: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const terms = catalogue?.terms ?? [];
  const order = (step: PlanFixStep) =>
    terms.findIndex((term) => term.id === stepTermId(step));
  const sorted = [...steps].sort((left, right) => order(left) - order(right));
  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
      <p className="text-xs font-medium text-foreground">
        {steps.length === 1
          ? "One change clears this"
          : `${steps.length} changes clear this`}
      </p>
      <ol className="space-y-1.5">
        {sorted.map((step, index) => {
          const term = terms.find((item) => item.id === stepTermId(step));
          const name = catalogue?.courses.find(
            (course) => course.code === step.courseCode,
          )?.name;
          const Icon = step.type === "add" ? Plus : ArrowRight;
          return (
            <li
              key={index}
              className="grid grid-cols-[4.5rem_1.25rem_minmax(0,1fr)] items-center gap-2 text-xs"
            >
              <span className="rounded-md bg-background px-1.5 py-0.5 text-center text-[11px] font-medium text-muted-foreground tabular-nums ring-1 ring-border">
                {term
                  ? `${sessionShortName(term.name)} ${term.year}`
                  : stepTermId(step)}
              </span>
              <Icon
                size={13}
                aria-hidden="true"
                className={
                  step.type === "add" ? "text-primary" : "text-muted-foreground"
                }
              />
              <span className="min-w-0 truncate text-foreground">
                {step.type === "add" ? "Add " : "Move "}
                <span className="font-mono text-[11px]">{step.courseCode}</span>
                {name ? (
                  <span className="text-muted-foreground"> {name}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Not now
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={onApply}>
          {busy ? (
            <LoaderCircle
              size={14}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          Apply changes
        </Button>
      </div>
      {footer ? (
        <div className="border-t border-border/70 pt-3">{footer}</div>
      ) : null}
    </div>
  );
}
