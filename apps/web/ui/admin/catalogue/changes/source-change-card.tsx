"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type {
  SourceReviewChange,
  SourceReviewDecision,
} from "@/lib/catalogue/source-review-store";
import { resolveSourceChangeAction } from "@/lib/coursemap/admin-catalogue-actions";
import { ReviewValue } from "./review-value";
import { showToast } from "@/ui/common/toast";

// The section heading already says a row was kept or has converged, so only
// the two actionable classifications carry a badge of their own.
const CLASSIFICATION_LABELS: Partial<
  Record<SourceReviewChange["classification"], string>
> = {
  conflict: "Conflict",
  source_change: "ANU changed",
};

/**
 * One review unit and its decision. Decisions are transactional: Use ANU
 * writes this path into the draft immediately and Keep current resolves the
 * row, so there is no second Apply step that could mix unrelated answers.
 */
export function SourceChangeCard({
  change,
  recordId,
  path,
  canWrite,
}: {
  change: SourceReviewChange;
  recordId: number;
  path: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isOverride = change.classification === "local_override";

  function resolve(decision: SourceReviewDecision) {
    startTransition(async () => {
      const result = await resolveSourceChangeAction({
        recordId,
        changeId: change.id,
        decision,
        path,
      });
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(result.message ?? "ANU change resolved");
      router.refresh();
    });
  }

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{change.label}</h3>
        {CLASSIFICATION_LABELS[change.classification] ? (
          <Badge
            variant={
              change.classification === "conflict"
                ? "warning-light"
                : "info-light"
            }
          >
            {CLASSIFICATION_LABELS[change.classification]}
          </Badge>
        ) : null}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {change.classification === "conflict" && change.hasBaseSource ? (
          <ReviewValue
            label="Previous ANU"
            value={change.baseSourceValue}
            unitKind={change.unitKind}
          />
        ) : null}
        <ReviewValue
          label="Current"
          value={change.localValue}
          unitKind={change.unitKind}
          note={
            change.isStale
              ? "You changed this after the review was created."
              : change.classification === "conflict"
                ? "Manually changed"
                : undefined
          }
        />
        <ReviewValue
          label={isOverride ? "ANU" : "New ANU"}
          value={change.incomingSourceValue}
          unitKind={change.unitKind}
        />
      </div>
      {canWrite ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {isOverride ? null : (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => resolve("keep_local")}
            >
              Keep current
            </Button>
          )}
          <Button
            type="button"
            variant={isOverride ? "outline" : "default"}
            disabled={isPending}
            onClick={() => resolve("use_source")}
          >
            {isOverride ? "Use ANU after all" : "Use ANU"}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
