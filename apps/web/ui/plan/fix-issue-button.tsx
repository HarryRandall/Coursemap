"use client";
import { useState } from "react";
import { WandSparkles } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { cn } from "@/lib/cn";
import type { Attempt } from "@/lib/coursemap/types";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { ResolveSteps } from "@/ui/plan/resolve-steps";
import { usePlanFix } from "@/ui/plan/use-plan-fix";

/**
 * Resolve for a blocked course outside the planner rows, such as the course
 * dialog's banner. The steps open in place, below the button, on a line of
 * their own. Renders nothing when Coursemap cannot find a way.
 */
export function FixIssueButton({
  attempt,
  catalogue,
  className,
}: {
  attempt: Attempt;
  catalogue?: PlanCatalogue;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { proposal, apply, busy } = usePlanFix(attempt, catalogue);
  if (!proposal.ok) return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        className={cn("h-7 gap-1.5 px-2 text-xs", className)}
        onClick={() => setOpen((value) => !value)}
      >
        <WandSparkles size={13} aria-hidden="true" />
        Resolve
      </Button>
      {open ? (
        <div className="basis-full text-foreground">
          <ResolveSteps
            steps={proposal.steps}
            catalogue={catalogue}
            busy={busy}
            onApply={() => void apply().then((done) => done && setOpen(false))}
            onDismiss={() => setOpen(false)}
          />
        </div>
      ) : null}
    </>
  );
}
