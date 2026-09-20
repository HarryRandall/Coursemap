"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import { Field, FieldLabel } from "@coursemap/ui/primitives/field";
import { Progress } from "@coursemap/ui/primitives/progress";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  applyReviewAction,
  resolveAllChangesAction,
  resolveReviewEntryAction,
} from "@/lib/coursemap/admin-catalogue-actions";
import type {
  ReviewEntry,
  ReviewTarget,
} from "@/lib/coursemap/admin-catalogue-record";
import { humaniseKey, fieldLabel } from "@/lib/coursemap/catalogue-kinds";
import { badgeVariantForTone } from "@/lib/ui";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { DataTableShell } from "@/ui/common/data-table";
import { ValueDiff } from "./value-diff";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * One import target's review: every field that differs from the baseline with
 * Accept and Reject, every parser flag with Acknowledge, then Apply. A target
 * without a baseline was accepted on import and shows its changes read-only.
 */
export function ReviewPanel({
  review,
  path,
  sourceHref,
}: {
  review: ReviewTarget;
  path: string;
  /** The ANU page this import read, so a reviewer can check a value at source. */
  sourceHref: string;
}) {
  const [pending, startTransition] = useTransition();
  const changes = review.entries.filter(
    (entry) => entry.entryKind === "change",
  );
  const flags = review.entries.filter((entry) => entry.entryKind === "flag");
  const openChanges = changes.filter((entry) => entry.status === "open");
  const openBlocking = flags.filter(
    (entry) => entry.isBlocking && entry.status === "open",
  );
  const applied = review.appliedAt !== null;
  const reviewable =
    review.status === "ready" && !applied && review.baselineSnapshotId !== null;

  function run(
    action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (result.message) toast.success(result.message);
      } else {
        toast.error(result.error ?? "The action failed.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>
            <h2>
              Run #{review.runNumber} ·{" "}
              {review.changeKind === "new"
                ? "first import"
                : review.changeKind === "changed"
                  ? "content changed"
                  : review.status === "unchanged"
                    ? "no change"
                    : review.status}
            </h2>
          </CardTitle>
          <CardDescription>
            Imported {formatDateTime(review.completedAt ?? review.createdAt)}
            {applied ? `, applied ${formatDateTime(review.appliedAt)}` : ""}
            {review.baselineSnapshotId === null && review.status === "ready"
              ? ". There was nothing to compare against, so every field was accepted and this import is the draft."
              : ""}
          </CardDescription>
        </div>
        {reviewable ? (
          <div className="flex items-center gap-2">
            {openChanges.length > 0 ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  type="button"
                  onClick={() =>
                    run(() =>
                      resolveAllChangesAction({
                        targetId: review.id,
                        status: "accepted",
                        path,
                      }),
                    )
                  }
                >
                  Accept all
                </Button>
                <ConfirmDialog
                  title={`Reject ${openChanges.length} change${openChanges.length === 1 ? "" : "s"}?`}
                  description="The imported values are discarded and the record keeps its current content. A later import recomputes the comparison from scratch, so a rejection is not remembered."
                  confirmLabel="Reject all"
                  destructive
                  onConfirm={() =>
                    run(() =>
                      resolveAllChangesAction({
                        targetId: review.id,
                        status: "rejected",
                        path,
                      }),
                    )
                  }
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      type="button"
                    >
                      Reject all
                    </Button>
                  }
                />
              </>
            ) : null}
            <Button
              size="sm"
              disabled={pending || openChanges.length > 0}
              type="button"
              title={
                openChanges.length > 0
                  ? "Decide every change first."
                  : undefined
              }
              onClick={() =>
                run(() => applyReviewAction({ targetId: review.id, path }))
              }
            >
              {pending ? (
                <LoaderCircle
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Apply to draft
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {flags.length > 0 ? (
          <section
            aria-labelledby={`flags-${review.id}`}
            className="flex flex-col gap-2"
          >
            <h3 id={`flags-${review.id}`} className="text-sm font-semibold">
              Flags{" "}
              <span className="font-normal text-muted-foreground">
                {openBlocking.length > 0
                  ? `${openBlocking.length} blocking publication`
                  : `${flags.length} noted by the parser`}
              </span>
            </h3>
            <ul className="flex flex-col gap-2">
              {flags.map((flag) => (
                <FlagRow
                  key={flag.id}
                  flag={flag}
                  path={path}
                  disabled={pending}
                  run={run}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <section
          aria-labelledby={`changes-${review.id}`}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id={`changes-${review.id}`} className="text-sm font-semibold">
              Changes{" "}
              <span className="font-normal text-muted-foreground">
                {changes.length === 0 ? "none" : changes.length}
              </span>
            </h3>
            {reviewable && changes.length > 0 ? (
              <DecisionProgress
                decided={changes.length - openChanges.length}
                total={changes.length}
              />
            ) : null}
          </div>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The page content matched the current draft.
            </p>
          ) : (
            <ChangeTable
              changes={changes}
              path={path}
              editable={reviewable}
              disabled={pending}
              run={run}
              sourceHref={sourceHref}
            />
          )}
        </section>
      </CardContent>
    </Card>
  );
}

type Run = (
  action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
) => void;

/**
 * Flag codes come from the extraction review items, uppercased. They are a
 * database vocabulary, so they are named for the reader rather than shown raw.
 */
const ISSUE_LABELS: Record<string, string> = {
  CONFLICT: "Model disagreed with the parser",
  EVIDENCE_MISSING: "No supporting excerpt",
  INVALID: "Failed the extraction contract",
};

function issueLabel(code: string | null) {
  if (!code) return "flag";
  return ISSUE_LABELS[code] ?? humaniseKey(code);
}

const ENTRY_STATUS_LABELS: Record<ReviewEntry["status"], string> = {
  open: "To decide",
  accepted: "Accepted",
  rejected: "Rejected",
  acknowledged: "Acknowledged",
};

function StatusBadge({ status }: { status: ReviewEntry["status"] }) {
  const tone =
    status === "accepted" || status === "acknowledged"
      ? "success"
      : status === "rejected"
        ? "neutral"
        : "warning";
  return (
    <Badge variant={badgeVariantForTone[tone]}>
      {ENTRY_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

/** How much of the decision list is behind the reviewer, not how much is left. */
function DecisionProgress({
  decided,
  total,
}: {
  decided: number;
  total: number;
}) {
  const label = `${decided} of ${total} decided`;
  return (
    <div className="flex items-center gap-2">
      <Progress
        aria-label={label}
        className="w-28"
        value={total === 0 ? 0 : (decided / total) * 100}
      />
      <span className="text-xs text-muted-foreground tabular-nums">
        {label}
      </span>
    </div>
  );
}

function isNested(value: unknown) {
  return typeof value === "object" && value !== null;
}

/**
 * One side of a change, small enough to sit in a table cell. A collection is
 * counted rather than printed; comparing it item by item is what the detail
 * row is for.
 */
function ValueCell({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "")
    return <span className="text-muted-foreground">Not set</span>;
  if (Array.isArray(value))
    return (
      <span className="text-muted-foreground">
        {value.length} {value.length === 1 ? "item" : "items"}
      </span>
    );
  if (typeof value === "object") {
    const fields = Object.keys(value).length;
    return (
      <span className="text-muted-foreground">
        {fields} {fields === 1 ? "field" : "fields"}
      </span>
    );
  }
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  return (
    <span className="line-clamp-3 break-words whitespace-pre-wrap">
      {String(value)}
    </span>
  );
}

/**
 * The changes are decisions over a fixed schema, so they read as a table: the
 * field, what the record holds, what the import read, where it read it and the
 * decision. A change whose values are collections, or that carries a source
 * excerpt, opens a detail row underneath with the field-by-field diff.
 */
function ChangeTable({
  changes,
  path,
  editable,
  disabled,
  run,
  sourceHref,
}: {
  changes: ReviewEntry[];
  path: string;
  editable: boolean;
  disabled: boolean;
  run: Run;
  sourceHref: string;
}) {
  return (
    <div
      className="min-w-0 overflow-x-auto"
      role="region"
      aria-label="Imported changes"
      data-scroll-kind="table"
      tabIndex={0}
    >
      <DataTableShell>
        <Table className="min-w-[940px]">
          <TableCaption className="sr-only">
            Every field the import changed, with the current value, the imported
            value and the decision taken
          </TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-52">Field</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>Imported</TableHead>
              <TableHead className="w-40">Source</TableHead>
              <TableHead className="w-56">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((change) => (
              <ChangeRows
                key={change.id}
                change={change}
                path={path}
                editable={editable}
                disabled={disabled}
                run={run}
                sourceHref={sourceHref}
              />
            ))}
          </TableBody>
        </Table>
      </DataTableShell>
    </div>
  );
}

function ChangeRows({
  change,
  path,
  editable,
  disabled,
  run,
  sourceHref,
}: {
  change: ReviewEntry;
  path: string;
  editable: boolean;
  disabled: boolean;
  run: Run;
  sourceHref: string;
}) {
  const detailId = useId();
  const [open, setOpen] = useState(false);
  const nested = isNested(change.oldValue) || isNested(change.newValue);
  const expandable = nested || Boolean(change.sourceExcerpt);
  const decide = (status: ReviewEntry["status"]) =>
    run(() => resolveReviewEntryAction({ entryId: change.id, status, path }));
  return (
    <>
      <TableRow
        data-status={change.status}
        className="align-top data-[status=rejected]:opacity-70"
      >
        <TableCell>
          <div className="flex flex-col items-start gap-1">
            <span className="font-medium text-foreground">
              {fieldLabel(change.fieldPath)}
            </span>
            {expandable ? (
              <Button
                aria-controls={detailId}
                aria-expanded={open}
                className="-ml-2 h-7 px-2 text-xs"
                onClick={() => setOpen((current) => !current)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {open ? (
                  <ChevronDown size={14} aria-hidden="true" />
                ) : (
                  <ChevronRight size={14} aria-hidden="true" />
                )}
                {open ? "Hide detail" : "Compare"}
              </Button>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="text-sm">
          <ValueCell value={change.oldValue} />
        </TableCell>
        <TableCell className="text-sm">
          <ValueCell value={change.newValue} />
        </TableCell>
        <TableCell>
          <div className="flex flex-col items-start gap-1 text-xs">
            {change.sourceLocator ? (
              <span className="break-words text-muted-foreground">
                {change.sourceLocator}
              </span>
            ) : null}
            <Link
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              href={sourceHref}
              rel="noreferrer"
              target="_blank"
            >
              ANU page
              <ExternalLink size={11} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </Link>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col items-start gap-1.5">
            <StatusBadge status={change.status} />
            {editable ? (
              <div className="flex flex-wrap items-center gap-1">
                {change.status !== "accepted" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    type="button"
                    onClick={() => decide("accepted")}
                  >
                    <Check size={14} aria-hidden="true" />
                    Accept
                  </Button>
                ) : null}
                {change.status !== "rejected" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    type="button"
                    onClick={() => decide("rejected")}
                  >
                    <X size={14} aria-hidden="true" />
                    Reject
                  </Button>
                ) : null}
                {change.status !== "open" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    type="button"
                    onClick={() => decide("open")}
                  >
                    <Undo2 size={14} aria-hidden="true" />
                    Undo
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      {expandable && open ? (
        <TableRow className="hover:bg-transparent">
          <TableCell className="bg-muted/20 p-4" colSpan={5} id={detailId}>
            <div className="flex flex-col gap-3">
              {nested ? (
                <ValueDiff
                  fieldPath={change.fieldPath}
                  oldValue={change.oldValue}
                  newValue={change.newValue}
                />
              ) : null}
              {change.sourceExcerpt ? (
                <blockquote className="border-l-2 border-primary/30 pl-3 text-sm leading-6 whitespace-pre-wrap">
                  {change.sourceExcerpt}
                </blockquote>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function FlagRow({
  flag,
  path,
  disabled,
  run,
}: {
  flag: ReviewEntry;
  path: string;
  disabled: boolean;
  run: Run;
}) {
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  const needsNote = flag.isBlocking;
  const acknowledge = () =>
    run(() =>
      resolveReviewEntryAction({
        entryId: flag.id,
        status: "acknowledged",
        note: note.trim() || undefined,
        path,
      }),
    );
  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
      data-status={flag.status}
    >
      <div className="flex flex-wrap items-start gap-2 text-sm">
        {flag.severity === "error" ? (
          <CircleAlert
            size={16}
            className="mt-0.5 shrink-0 text-destructive"
            aria-hidden="true"
          />
        ) : (
          <TriangleAlert
            size={16}
            className="mt-0.5 shrink-0 text-amber-600"
            aria-hidden="true"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span>
            <span className="font-medium">{fieldLabel(flag.fieldPath)}</span>
            <span className="text-muted-foreground">
              {" "}
              · {issueLabel(flag.issueCode)}
            </span>
            {flag.isBlocking ? (
              <Badge variant="destructive-light" className="ml-2">
                blocks publication
              </Badge>
            ) : null}
          </span>
          <span className="text-muted-foreground">{flag.summary}</span>
          {flag.resolutionNote ? (
            <span className="text-xs text-muted-foreground">
              Note: {flag.resolutionNote}
            </span>
          ) : null}
        </div>
        <StatusBadge status={flag.status} />
        {flag.status === "open" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            type="button"
            onClick={() =>
              needsNote && !noting ? setNoting(true) : acknowledge()
            }
          >
            Acknowledge
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            type="button"
            onClick={() =>
              run(() =>
                resolveReviewEntryAction({
                  entryId: flag.id,
                  status: "open",
                  path,
                }),
              )
            }
          >
            <Undo2 size={14} aria-hidden="true" />
            Reopen
          </Button>
        )}
      </div>
      {noting && flag.status === "open" ? (
        <div className="flex flex-col gap-2">
          <Field>
            <FieldLabel htmlFor={`note-${flag.id}`}>
              Why publication may proceed despite this flag
            </FieldLabel>
            <Textarea
              id={`note-${flag.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Checked against the ANU page on…"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={disabled || !note.trim()}
              type="button"
              onClick={acknowledge}
            >
              Save and acknowledge
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setNoting(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
