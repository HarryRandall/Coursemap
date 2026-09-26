"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { ReviewNote } from "@/lib/catalogue/review-notes";
import type { SourceReviewChange } from "@/lib/catalogue/source-review-store";
import {
  approveFirstReadAction,
  resolveSourceChangeAction,
} from "@/lib/coursemap/admin-catalogue-actions";
import { CardNotes } from "./model-notes";
import { ReviewDiff } from "./review-diff";
import { type ReviewSubject, ReviewValue } from "./review-value";

const BAND_BADGE = {
  needs_review: { label: "Needs review", variant: "destructive-light" },
  check: { label: "Check", variant: "warning-light" },
  accepted: { label: "Accepted", variant: "success-light" },
} as const;

export function confidenceLabel(confidence: number | null) {
  return confidence === null
    ? "No % given"
    : `${Math.round(confidence * 100)}% sure`;
}

function useResolve(recordId: number, path: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const run = (work: () => ReturnType<typeof approveFirstReadAction>) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      router.refresh();
    });
  return {
    isPending,
    approve: (changeIds: number[]) =>
      run(() => approveFirstReadAction({ recordId, changeIds, path })),
    keepEdit: (changeId: number) =>
      run(() =>
        resolveSourceChangeAction({
          recordId,
          changeId,
          decision: "keep_local",
          path,
        }),
      ),
  };
}

function FirstReadCard({
  change,
  recordId,
  path,
  canWrite,
  subject,
  notes,
}: {
  change: SourceReviewChange;
  recordId: number;
  path: string;
  canWrite: boolean;
  subject: ReviewSubject | null;
  notes: readonly ReviewNote[];
}) {
  const { isPending, approve, keepEdit } = useResolve(recordId, path);
  const band = BAND_BADGE[change.band ?? "check"];
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{change.label}</h3>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="tabular-nums">
            {confidenceLabel(change.confidence)}
          </Badge>
          <Badge variant={band.variant}>{band.label}</Badge>
        </div>
      </div>
      {change.reason ? (
        <p className="mt-1 text-sm text-muted-foreground">{change.reason}</p>
      ) : null}
      {/* The reason may already be one of the notes. */}
      <CardNotes
        notes={notes.filter((note) => note.message !== change.reason)}
      />
      <div className="mt-3">
        {change.isStale ? (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              You corrected this after the reading.
            </p>
            <ReviewDiff
              before={change.incomingSourceValue}
              after={change.localValue}
              beforeLabel="ANU reading"
              afterLabel="Your edit"
              unitKind={change.unitKind}
            />
          </>
        ) : (
          <ReviewValue
            label="Read from ANU"
            value={change.incomingSourceValue}
            unitKind={change.unitKind}
            subject={subject}
          />
        )}
      </div>
      {canWrite ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {change.isStale ? (
            <>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => keepEdit(change.id)}
              >
                Keep my edit
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => approve([change.id])}
              >
                Use ANU reading
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => approve([change.id])}
              >
                Approve
              </Button>
              {/* Correcting happens in the editor, where the field lives. */}
              <Button asChild variant="outline">
                <Link href={path}>Correct in Content</Link>
              </Button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function BulkApprove({
  changes,
  recordId,
  path,
  label,
}: {
  changes: SourceReviewChange[];
  recordId: number;
  path: string;
  label: string;
}) {
  const { isPending, approve } = useResolve(recordId, path);
  const approvable = changes.filter((change) => !change.isStale);
  if (approvable.length === 0) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => approve(approvable.map((change) => change.id))}
    >
      {label}
    </Button>
  );
}

/**
 * A record's first reading from ANU, rated part by part. What the model was
 * unsure of leads and holds publishing; what it read plainly is folded away,
 * one click from being approved or reopened.
 */
export function FirstReadReview({
  changes,
  recordId,
  path,
  canWrite,
  subject = null,
  notes = {},
}: {
  changes: SourceReviewChange[];
  recordId: number;
  path: string;
  canWrite: boolean;
  subject?: ReviewSubject | null;
  /** The model's notes on each change, by field path. */
  notes?: Readonly<Record<string, readonly ReviewNote[]>>;
}) {
  const needsReview = changes.filter(
    (change) => change.band === "needs_review",
  );
  const check = changes.filter((change) => change.band === "check");
  const accepted = changes.filter((change) => change.band === "accepted");
  const card = (change: SourceReviewChange) => (
    <FirstReadCard
      canWrite={canWrite}
      change={change}
      key={change.id}
      notes={notes[change.fieldPath] ?? []}
      path={path}
      recordId={recordId}
      subject={subject}
    />
  );

  return (
    <section
      aria-labelledby="first-read-heading"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="first-read-heading"
          className="text-sm font-semibold tracking-wide uppercase"
        >
          First reading from ANU
        </h2>
        <p className="text-sm text-muted-foreground">
          {needsReview.length
            ? `${needsReview.length} ${needsReview.length === 1 ? "part needs" : "parts need"} review before this can be published.`
            : "Nothing is holding publication."}{" "}
          {check.length ? `${check.length} worth a look.` : ""}
        </p>
      </div>

      {needsReview.length ? (
        <div className="flex flex-col gap-3">{needsReview.map(card)}</div>
      ) : null}

      {check.length ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Worth a look</h3>
            {canWrite ? (
              <BulkApprove
                changes={check}
                label={`Approve all ${check.length}`}
                path={path}
                recordId={recordId}
              />
            ) : null}
          </div>
          {check.map(card)}
        </div>
      ) : null}

      {accepted.length ? (
        <details className="group flex flex-col gap-3">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <ChevronRight
                aria-hidden="true"
                className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
              />
              Stated plainly
              <span className="font-normal text-muted-foreground tabular-nums">
                {accepted.length}
              </span>
            </h3>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {canWrite ? (
              <div className="flex justify-end">
                <BulkApprove
                  changes={accepted}
                  label={`Approve all ${accepted.length} stated plainly`}
                  path={path}
                  recordId={recordId}
                />
              </div>
            ) : null}
            {accepted.map(card)}
          </div>
        </details>
      ) : null}
    </section>
  );
}
