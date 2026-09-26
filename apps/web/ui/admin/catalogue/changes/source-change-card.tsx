"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type {
  SourceReviewChange,
  SourceReviewDecision,
} from "@/lib/catalogue/source-review-store";
import type { ReviewNote } from "@/lib/catalogue/review-notes";
import { resolveSourceChangeAction } from "@/lib/coursemap/admin-catalogue-actions";
import { confidenceLabel } from "./first-read-review";
import { CardNotes } from "./model-notes";
import { ReviewDiff } from "./review-diff";
import { type ReviewSubject, ReviewValue } from "./review-value";
import { showToast } from "@/ui/common/toast";

function Fold({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details>
      <summary className="cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline">
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

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
  subject = null,
  notes = [],
}: {
  change: SourceReviewChange;
  recordId: number;
  path: string;
  canWrite: boolean;
  subject?: ReviewSubject | null;
  notes?: readonly ReviewNote[];
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
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="tabular-nums">
            {confidenceLabel(change.confidence)}
          </Badge>
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
      </div>
      <CardNotes notes={notes} />
      {change.isStale || change.classification === "conflict" ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {change.isStale
            ? "You changed this after the review was created."
            : "Changed by hand since the last check."}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">
        {/* What choosing ANU would do to the draft as it stands. */}
        <ReviewDiff
          before={change.localValue}
          after={change.incomingSourceValue}
          beforeLabel="Current"
          afterLabel={isOverride ? "ANU" : "New ANU"}
          unitKind={change.unitKind}
        />
        {change.classification === "conflict" && change.hasBaseSource ? (
          <Fold summary="What ANU changed since the last check">
            <ReviewDiff
              before={change.baseSourceValue}
              after={change.incomingSourceValue}
              beforeLabel="Previous ANU"
              afterLabel="New ANU"
              unitKind={change.unitKind}
            />
          </Fold>
        ) : null}
        {change.unitKind === "requirement_rule" &&
        change.incomingSourceValue !== null ? (
          <Fold summary="View the ANU rule">
            <ReviewValue
              label={isOverride ? "ANU" : "New ANU"}
              value={change.incomingSourceValue}
              unitKind={change.unitKind}
              subject={subject}
            />
          </Fold>
        ) : null}
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
