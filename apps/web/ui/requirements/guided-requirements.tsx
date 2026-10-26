"use client";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  PartyPopper,
} from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import type {
  CourseHints,
  RuleToPlan,
  StructureToPlan,
} from "@/ui/plan/plan-suggestions";
import { hasRuleCourses, RuleCourses } from "@/ui/plan/rule-courses";
import { headingSaysChoice, RuleGroup } from "@/ui/plan/rule-group";
import { UnitsBar } from "@/ui/requirements/units-bar";

type Step = { key: string; structure: StructureToPlan; rule: RuleToPlan };

/** A rule that still needs courses, rather than a total every other rule fills. */
function isOpenRule(rule: RuleToPlan) {
  return !rule.covered && !rule.note;
}

/** Required courses first, then quick choices, then rules with long lists. */
function stepOrder(rule: RuleToPlan) {
  if (rule.compulsory) return 0;
  return rule.matching === null &&
    rule.courses.length > 0 &&
    rule.courses.length <= 4
    ? 1
    : 2;
}

/** Open rules in the order to plan them, then the rules already met. */
function stepsOf(structures: readonly StructureToPlan[]): Step[] {
  const all = structures.flatMap((structure) =>
    structure.rules
      .filter((rule) => !rule.note)
      .map((rule) => ({ key: rule.key, structure, rule })),
  );
  return [
    ...all
      .filter((step) => isOpenRule(step.rule))
      .sort((left, right) => stepOrder(left.rule) - stepOrder(right.rule)),
    ...all.filter((step) => !isOpenRule(step.rule)),
  ];
}

/**
 * A structure's rules one at a time: what the rule asks, how far the plan
 * has come and the courses that count, with Skip and Next. Open rules come
 * first and the rules already met sit at the end of the bar in green. The
 * steps are fixed when the view opens, so a rule the student has just met
 * stays in place and turns green. The full rule list, with its overrides,
 * stays one click away.
 */
export function GuidedRequirements({
  structures,
  hints,
  onAdd,
  onOpen,
  fullRules,
}: {
  structures: StructureToPlan[];
  hints: CourseHints;
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  /** Every rule as the full requirement tree, for students who want it. */
  fullRules: ReactNode;
}) {
  const [stepKeys] = useState(() =>
    stepsOf(structures).map((step) => step.key),
  );
  const [index, setIndex] = useState(0);
  const [showFull, setShowFull] = useState(false);
  const current = new Map(
    structures.flatMap((structure) =>
      structure.rules.map((rule) => [
        rule.key,
        { key: rule.key, structure, rule },
      ]),
    ),
  );
  const steps = stepKeys.flatMap((key) => {
    const step = current.get(key);
    return step ? [step] : [];
  });
  const finished = index >= steps.length;
  const step = steps[Math.min(index, steps.length - 1)];
  const stillOpen = steps.filter((item) => isOpenRule(item.rule)).length;
  const severalStructures = structures.length > 1;
  const nextOpen = steps.findIndex(
    (item, position) => position > index && isOpenRule(item.rule),
  );

  return (
    <div className="space-y-3">
      {steps.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          This has no rules to plan against yet.
        </p>
      ) : (
        <>
          <ol className="flex gap-1" aria-label="Steps">
            {steps.map((item, position) => (
              <li key={item.key} className="flex-1">
                <button
                  type="button"
                  aria-label={`${item.rule.heading}${isOpenRule(item.rule) ? "" : ", done or planned"}`}
                  aria-current={position === index ? "step" : undefined}
                  title={item.rule.heading}
                  onClick={() => setIndex(position)}
                  className={cn(
                    "block h-1.5 w-full cursor-pointer rounded-full transition",
                    position === index
                      ? isOpenRule(item.rule)
                        ? "bg-primary"
                        : "bg-success ring-2 ring-success/30"
                      : !isOpenRule(item.rule)
                        ? "bg-success/70 hover:bg-success"
                        : "bg-muted hover:bg-muted-foreground/30",
                  )}
                />
              </li>
            ))}
          </ol>

          {finished ? (
            <section className="flex h-96 flex-col items-center justify-center rounded-xl border border-border bg-card px-6 text-center">
              {stillOpen > 0 ? null : (
                <PartyPopper
                  size={28}
                  aria-hidden="true"
                  className="mx-auto text-emerald-600 dark:text-emerald-400"
                />
              )}
              <h2 className="mt-3 text-lg font-semibold tracking-tight">
                {stillOpen > 0
                  ? `${stillOpen} ${stillOpen === 1 ? "rule" : "rules"} still to plan`
                  : "You're all planned here"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {stillOpen > 0
                  ? "You skipped these. Come back to them whenever you're ready."
                  : "Every rule here is done or has courses planned."}
              </p>
              {stillOpen > 0 ? (
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() =>
                    setIndex(steps.findIndex((item) => isOpenRule(item.rule)))
                  }
                >
                  Go to the next open rule
                </Button>
              ) : null}
            </section>
          ) : step ? (
            <section
              aria-labelledby="guided-step-title"
              className="flex h-96 flex-col rounded-xl border border-border bg-card"
            >
              <p className="sr-only" aria-live="polite">
                {`Rule ${index + 1} of ${steps.length}`}
              </p>
              <div className="shrink-0 space-y-2 px-4 pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {severalStructures ? (
                      <p className="mb-1 text-xs text-muted-foreground">
                        {step.structure.structure.name}
                      </p>
                    ) : null}
                    <h2
                      id="guided-step-title"
                      className="text-base leading-tight font-semibold tracking-tight text-balance"
                    >
                      {step.rule.heading}
                    </h2>
                    {step.rule.detail !== step.rule.heading ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {step.rule.detail}
                      </p>
                    ) : null}
                  </div>
                  {isOpenRule(step.rule) ? (
                    step.rule.left && !headingSaysChoice(step.rule) ? (
                      <Badge variant="warning-light" className="tabular-nums">
                        {step.rule.left}
                      </Badge>
                    ) : null
                  ) : (
                    <Badge variant="success-light">
                      <CheckCircle2 aria-hidden="true" />
                      Done or planned
                    </Badge>
                  )}
                </div>
                {step.rule.bar &&
                step.rule.choice === null &&
                isOpenRule(step.rule) ? (
                  <div className="flex items-center gap-3">
                    <UnitsBar
                      completed={step.rule.bar.completed}
                      planned={step.rule.bar.planned}
                      goal={step.rule.bar.target}
                      className="h-1.5 flex-1"
                    />
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {step.rule.count}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {hasRuleCourses(step.rule, hints, !isOpenRule(step.rule)) ? (
                  <RuleCourses
                    key={step.key}
                    rule={step.rule}
                    kind={step.structure.structure.kind}
                    hints={hints}
                    readOnly={!isOpenRule(step.rule)}
                    expanded
                    onAdd={onAdd}
                    onOpen={onOpen}
                  />
                ) : null}
                {step.rule.options?.map((option) => (
                  <RuleGroup
                    key={option.key}
                    rule={option}
                    kind={step.structure.structure.kind}
                    hints={hints}
                    readOnly={!isOpenRule(step.rule)}
                    onAdd={onAdd}
                    onOpen={onOpen}
                  />
                ))}
              </div>
              <div
                className={cn(
                  "flex shrink-0 items-center gap-2 border-t border-border px-4 py-2",
                  index > 0 ? "justify-between" : "justify-end",
                )}
              >
                {index > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIndex(index - 1)}
                  >
                    <ArrowLeft aria-hidden="true" />
                    Back
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={isOpenRule(step.rule) ? "ghost" : "default"}
                  onClick={() =>
                    setIndex(
                      isOpenRule(step.rule)
                        ? index + 1
                        : nextOpen === -1
                          ? steps.length
                          : nextOpen,
                    )
                  }
                >
                  {isOpenRule(step.rule)
                    ? "Skip for now"
                    : nextOpen === -1
                      ? "Finish"
                      : "Next"}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </section>
          ) : null}
        </>
      )}

      <div>
        <button
          type="button"
          aria-expanded={showFull}
          onClick={() => setShowFull((value) => !value)}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          {showFull ? "Hide every rule" : "Show every rule"}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn("transition-transform", showFull && "rotate-180")}
          />
        </button>
        {showFull ? <div className="mt-3">{fullRules}</div> : null}
      </div>
    </div>
  );
}
