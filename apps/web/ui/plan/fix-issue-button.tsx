"use client";
import { Button } from "@coursemap/ui/primitives/button";

import { LoaderCircle, WandSparkles } from "lucide-react";
import { useState } from "react";
import { useCoursemap } from "@/app/providers";

import { cn } from "@/lib/cn";
import type { Attempt } from "@/lib/coursemap/types";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { proposePrerequisiteFix } from "@/lib/planner";

export function FixIssueButton({
  attempt,
  catalogue,
  size = "sm",
  className,
}: {
  attempt: Attempt;
  catalogue?: PlanCatalogue;
  size?: "sm" | "md";
  className?: string;
}) {
  const { state, addCourse, reorderAttempt, notify } = useCoursemap();
  const [busy, setBusy] = useState(false);
  const proposal = proposePrerequisiteFix(attempt, state.attempts, catalogue);
  if (!proposal.ok) return null;

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    try {
      for (const step of proposal.steps) {
        const result =
          step.type === "move"
            ? await reorderAttempt(step.attemptId, step.toTermId)
            : await addCourse(step.courseCode, step.termId, step.academicYear);
        if (!result.ok) {
          notify(result.message, "warning");
          return;
        }
      }
      notify(
        `Done: ${proposal.summary.charAt(0).toLowerCase()}${proposal.summary.slice(1)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size={size === "md" ? "default" : size}
      className={cn("min-h-9", className)}
      disabled={busy}
      title="Coursemap found a way to clear this"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void apply();
      }}
    >
      {busy ? (
        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
      ) : (
        <WandSparkles size={14} aria-hidden="true" />
      )}
      <span className="truncate">{proposal.summary}</span>
    </Button>
  );
}
