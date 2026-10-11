"use client";
import { Info } from "lucide-react";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { PlanFixResult } from "@/lib/planner";
import { ResolveSteps } from "@/ui/plan/resolve-steps";
import { TakeAnywayForm } from "@/ui/plan/take-anyway-form";

/**
 * What Resolve offers for one course: the changes that clear it with Apply,
 * or why Coursemap can't rearrange it away. Taking it anyway is always there,
 * as a separate choice.
 */
export function ResolvePanel({
  courseCode,
  proposal,
  catalogue,
  busy,
  onApply,
  onClose,
}: {
  courseCode: string;
  proposal: PlanFixResult;
  catalogue?: PlanCatalogue;
  busy: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const takeAnyway = (
    <TakeAnywayForm courseCode={courseCode} onDone={onClose} />
  );
  if (proposal.ok)
    return (
      <ResolveSteps
        steps={proposal.steps}
        catalogue={catalogue}
        busy={busy}
        onApply={onApply}
        onDismiss={onClose}
        footer={takeAnyway}
      />
    );
  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
      {proposal.message ? (
        <p className="flex gap-2 text-xs text-muted-foreground">
          <Info size={13} aria-hidden="true" className="mt-px shrink-0" />
          <span>{proposal.message}</span>
        </p>
      ) : null}
      <div className="border-t border-border/70 pt-3">{takeAnyway}</div>
    </div>
  );
}
