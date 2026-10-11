"use client";
import { useEffect, useState } from "react";
import { ChevronDown, WandSparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CoursePlanStatus, PlanFixStep } from "@/lib/planner";
import type { Attempt } from "@/lib/coursemap/types";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { ResolveSteps } from "@/ui/plan/resolve-steps";
import { usePlanFix } from "@/ui/plan/use-plan-fix";

/**
 * The line under a blocked course: what blocks it, in words, lined up with
 * the course code, and a Resolve toggle that opens Coursemap's fix inside
 * the row. While it is open the board previews where each change lands.
 */
export function PlanIssueFooter({
  attempt,
  flags,
  catalogue,
  onPreviewChange,
}: {
  attempt: Attempt;
  flags?: CoursePlanStatus;
  catalogue?: PlanCatalogue;
  onPreviewChange?: (steps: readonly PlanFixStep[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { proposal, apply, busy } = usePlanFix(attempt, catalogue);
  const steps = proposal.ok ? proposal.steps : null;
  const showing = open && steps !== null;

  useEffect(() => {
    onPreviewChange?.(showing ? steps : null);
    return () => onPreviewChange?.(null);
    // The preview follows the open panel and the steps it shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing, proposal.ok && proposal.summary]);

  const hard = flags?.issues.filter((issue) => issue.severity === "hard") ?? [];
  if (hard.length === 0) return null;

  return (
    <div className="col-span-2 pr-2 pb-2 pl-[3.25rem]">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-destructive">
          {hard.map((issue) => issue.detail).join(" · ")}
        </p>
        {steps ? (
          <button
            type="button"
            aria-expanded={showing}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary transition hover:bg-primary/10"
          >
            <WandSparkles size={13} aria-hidden="true" />
            Resolve
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={cn("transition-transform", showing && "rotate-180")}
            />
          </button>
        ) : null}
      </div>
      {/* The panel grows from nothing so the rows below slide rather than jump. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          showing ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {steps ? (
            <div className="pt-1.5">
              <ResolveSteps
                steps={steps}
                catalogue={catalogue}
                busy={busy}
                onApply={() =>
                  void apply().then((done) => done && setOpen(false))
                }
                onDismiss={() => setOpen(false)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
