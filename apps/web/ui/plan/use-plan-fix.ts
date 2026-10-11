"use client";
import { useState } from "react";
import { useCoursemap } from "@/app/providers";
import type { Attempt } from "@/lib/coursemap/types";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { proposePrerequisiteFix } from "@/lib/planner";

/**
 * Coursemap's way out of a blocked course and a way to take it. The steps
 * run in order and stop at the first that fails, so a half-applied fix says
 * which step went wrong.
 */
export function usePlanFix(attempt: Attempt, catalogue?: PlanCatalogue) {
  const { state, addCourse, reorderAttempt, notify } = useCoursemap();
  const [busy, setBusy] = useState(false);
  const proposal = proposePrerequisiteFix(attempt, state.attempts, catalogue);

  const apply = async () => {
    if (busy || !proposal.ok) return false;
    setBusy(true);
    try {
      for (const step of proposal.steps) {
        const result =
          step.type === "move"
            ? await reorderAttempt(step.attemptId, step.toTermId)
            : await addCourse(step.courseCode, step.termId, step.academicYear);
        if (!result.ok) {
          notify(result.message, "warning");
          return false;
        }
      }
      notify(
        `Done: ${proposal.summary.charAt(0).toLowerCase()}${proposal.summary.slice(1)}`,
      );
      return true;
    } finally {
      setBusy(false);
    }
  };

  return { proposal, apply, busy };
}
