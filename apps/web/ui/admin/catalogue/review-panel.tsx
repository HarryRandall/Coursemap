"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@coursemap/ui/primitives/collapsible";
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
  resolveReviewEntriesAction,
  resolveReviewEntryAction,
} from "@/lib/coursemap/admin-catalogue-actions";
import type {
  ReviewEntry,
  ReviewTarget,
} from "@/lib/coursemap/admin-catalogue-record";
import { fieldLabel } from "@/lib/coursemap/catalogue-kinds";
import { badgeVariantForTone } from "@/lib/ui";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { DataTableShell } from "@/ui/common/data-table";
import { OptionPicker } from "@/ui/common/option-picker";
import { ProgressRing } from "@/ui/common/progress-ring";
import { anuSourceLocation } from "./anu-source";
import {
  type ChangeGroup,
  type FlagGroup,
  flagFieldLabel,
  groupChanges,
  groupFlags,
  issueLabel,
  reviewSummary,
} from "./review-state";
import { ValueDiff } from "./value-diff";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type Run = (
  action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
) => void;

type ChangeFilter = "open" | "all" | "accepted" | "rejected";

const CHANGE_FILTERS: Array<{ value: ChangeFilter; label: string }> = [
  { value: "all", label: "Every change" },
  { value: "open", label: "Still to decide" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

/**
 * One import target's review: a verdict and the next action, the parser flags
 * split by whether they hold publication, then the decision table. A target
 * without a baseline was accepted on import and shows its changes read-only.
 *
 * The panel collapses itself when nothing in the run is waiting on the
 * reviewer, so a record with five imports behind it is not five full-height
 * cards wherever this is rendered.
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
  const summary = reviewSummary(review);
  const [open, setOpen] = useState(summary.actionable);

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

  const title = `Run #${review.runNumber} · ${
    review.changeKind === "new"
      ? "first import"
      : review.changeKind === "changed"
        ? "content changed"
        : review.status === "unchanged"
          ? "no change"
          : review.status
  }`;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="gap-1">
          <CardTitle>
            <h2 className="text-base font-semibold">{title}</h2>
          </CardTitle>
          <CardDescription>
            Imported {formatDateTime(review.completedAt ?? review.createdAt)}
            {summary.applied
              ? `, applied ${formatDateTime(review.appliedAt)}`
              : ""}
            {open ? "" : ` · ${summary.headline}`}
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            {summary.openChanges.length > 0 ? (
              <Badge variant={badgeVariantForTone.warning}>
                {summary.openChanges.length} to decide
              </Badge>
            ) : null}
            <CollapsibleTrigger asChild>
              <Button size="sm" type="button" variant="ghost">
                {open ? (
                  <ChevronDown size={14} aria-hidden="true" />
                ) : (
                  <ChevronRight size={14} aria-hidden="true" />
                )}
                {open ? "Hide" : "Show"}
                <span className="sr-only"> run {review.runNumber}</span>
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-5">
            <ReviewVerdict
              disabled={pending}
              path={path}
              pending={pending}
              review={review}
              run={run}
              summary={summary}
            />
            {review.baselineSnapshotId === null && review.status === "ready" ? (
              <p className="text-sm text-muted-foreground">
                There was nothing to compare against, so every field was
                accepted and this import is the draft.
              </p>
            ) : null}
            {summary.flags.length > 0 ? (
              <FlagSection
                disabled={pending}
                flags={summary.flags}
                path={path}
                reviewId={review.id}
                run={run}
              />
            ) : null}
            <ChangeSection
              changes={summary.changes}
              disabled={pending}
              editable={summary.reviewable}
              path={path}
              reviewId={review.id}
              run={run}
              sourceHref={sourceHref}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * The state of the run and the one control that moves it forward. Accept and
 * Reject are offered while decisions remain; Apply only once none do, so there
 * is never a choice between a live action and a disabled one.
 */
function ReviewVerdict({
  disabled,
  path,
  pending,
  review,
  run,
  summary,
}: {
  disabled: boolean;
  path: string;
  pending: boolean;
  review: ReviewTarget;
  run: Run;
  summary: ReturnType<typeof reviewSummary>;
}) {
  const outstanding = summary.openChanges.length;
  const tone =
    outstanding > 0 || summary.openBlockingFlags.length > 0
      ? "border-warning/40 bg-warning/5"
      : summary.reviewable
        ? "border-info/40 bg-info/5"
        : "border-border bg-muted/30";
  return (
    <div
      className={`flex flex-wrap items-center gap-4 rounded-lg border p-4 ${tone}`}
    >
      {summary.changes.length > 0 ? (
        <ProgressRing
          completed={summary.decided}
          planned={0}
          target={summary.changes.length}
        >
          {summary.decided}/{summary.changes.length}
        </ProgressRing>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{summary.headline}</p>
        <p className="text-sm text-muted-foreground">{summary.detail}</p>
      </div>
      {summary.reviewable ? (
        <div className="flex flex-wrap items-center gap-2">
          {outstanding > 0 ? (
            <>
              <Button
                disabled={disabled}
                onClick={() =>
                  run(() =>
                    resolveReviewEntriesAction({
                      entryIds: summary.openChanges.map((entry) => entry.id),
                      status: "accepted",
                      path,
                    }),
                  )
                }
                type="button"
              >
                <Check size={16} aria-hidden="true" />
                Accept the remaining {outstanding}
              </Button>
              <ConfirmDialog
                confirmLabel="Reject them"
                description="The imported values are discarded and the record keeps its current content. A later import recomputes the comparison from scratch, so a rejection is not remembered."
                destructive
                onConfirm={() =>
                  run(() =>
                    resolveReviewEntriesAction({
                      entryIds: summary.openChanges.map((entry) => entry.id),
                      status: "rejected",
                      path,
                    }),
                  )
                }
                title={`Reject ${outstanding} change${outstanding === 1 ? "" : "s"}?`}
                trigger={
                  <Button disabled={disabled} type="button" variant="outline">
                    <X size={16} aria-hidden="true" />
                    Reject them
                  </Button>
                }
              />
            </>
          ) : (
            <Button
              disabled={disabled}
              onClick={() =>
                run(() => applyReviewAction({ targetId: review.id, path }))
              }
              type="button"
            >
              {pending ? (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Apply to draft
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
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

/**
 * Flags are diagnostics of unequal weight. A blocking one holds publication
 * and is a decision, so it keeps its own row and its note field. The rest are
 * the same few kinds repeated, so they collapse into one row per kind that can
 * be cleared in a single action.
 */
function FlagSection({
  disabled,
  flags,
  path,
  reviewId,
  run,
}: {
  disabled: boolean;
  flags: ReviewEntry[];
  path: string;
  reviewId: string;
  run: Run;
}) {
  const { blocking, groups } = groupFlags(flags);
  const openBlocking = blocking.filter((flag) => flag.status === "open");
  const openWarnings = groups.reduce(
    (total, group) => total + group.open.length,
    0,
  );
  return (
    <section
      aria-labelledby={`flags-${reviewId}`}
      className="flex flex-col gap-2"
    >
      <h3 id={`flags-${reviewId}`} className="text-sm font-semibold">
        Flags{" "}
        <span className="font-normal text-muted-foreground">
          {openBlocking.length > 0
            ? `${openBlocking.length} blocking publication, ${openWarnings} for information`
            : `${flags.length} noted by the parser, none blocking publication`}
        </span>
      </h3>
      {blocking.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {blocking.map((flag) => (
            <BlockingFlag
              key={flag.id}
              disabled={disabled}
              flag={flag}
              path={path}
              run={run}
            />
          ))}
        </ul>
      ) : null}
      {groups.map((group) => (
        <WarningFlagGroup
          key={group.key}
          disabled={disabled}
          group={group}
          path={path}
          run={run}
        />
      ))}
    </section>
  );
}

/**
 * A flag that holds publication. Acknowledging it is a statement on the
 * record, so it asks for the reason before it will take one.
 */
function BlockingFlag({
  disabled,
  flag,
  path,
  run,
}: {
  disabled: boolean;
  flag: ReviewEntry;
  path: string;
  run: Run;
}) {
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/4 p-3"
      data-status={flag.status}
    >
      <div className="flex flex-wrap items-start gap-2 text-sm">
        <CircleAlert
          size={16}
          className="mt-0.5 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span>
            <span className="font-medium">
              {flagFieldLabel(flag.fieldPath)}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {issueLabel(flag.issueCode)}
            </span>
            <Badge variant="destructive-light" className="ml-2">
              Blocks publication
            </Badge>
          </span>
          {flag.summary ? (
            <span className="text-muted-foreground">{flag.summary}</span>
          ) : null}
          {flag.sourceExcerpt ? (
            <blockquote className="border-l-2 border-border pl-3 text-sm whitespace-pre-wrap text-muted-foreground">
              {flag.sourceExcerpt}
            </blockquote>
          ) : null}
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
            onClick={() => setNoting(true)}
          >
            Acknowledge
          </Button>
        ) : (
          <ReopenButton disabled={disabled} flag={flag} path={path} run={run} />
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
              onClick={() =>
                run(() =>
                  resolveReviewEntryAction({
                    entryId: flag.id,
                    status: "acknowledged",
                    note: note.trim(),
                    path,
                  }),
                )
              }
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

function ReopenButton({
  disabled,
  flag,
  path,
  run,
}: {
  disabled: boolean;
  flag: ReviewEntry;
  path: string;
  run: Run;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      type="button"
      onClick={() =>
        run(() =>
          resolveReviewEntryAction({ entryId: flag.id, status: "open", path }),
        )
      }
    >
      <Undo2 size={14} aria-hidden="true" />
      Reopen
    </Button>
  );
}

/** Six identical warnings read as one line with a count, not six cards. */
function WarningFlagGroup({
  disabled,
  group,
  path,
  run,
}: {
  disabled: boolean;
  group: FlagGroup;
  path: string;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  const fields = group.entries
    .map((flag) => flagFieldLabel(flag.fieldPath))
    .join(", ");
  return (
    <Collapsible
      className="rounded-lg border border-border"
      onOpenChange={setOpen}
      open={open}
    >
      {/* The controls drop below the name on a narrow screen rather than
          squeezing it into a column two words wide. */}
      <div className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <TriangleAlert
            size={16}
            className="mt-0.5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <span className="font-medium">{group.label}</span>
            <p className="truncate text-xs text-muted-foreground">{fields}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {group.entries.length}{" "}
            {group.entries.length === 1 ? "field" : "fields"}
          </Badge>
          {group.open.length > 0 ? (
            <Button
              disabled={disabled}
              onClick={() =>
                run(() =>
                  resolveReviewEntriesAction({
                    entryIds: group.open.map((flag) => flag.id),
                    status: "acknowledged",
                    path,
                  }),
                )
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Acknowledge{" "}
              {group.open.length === group.entries.length
                ? "all"
                : group.open.length}
            </Button>
          ) : (
            <Badge variant={badgeVariantForTone.success}>Acknowledged</Badge>
          )}
          <CollapsibleTrigger asChild>
            <Button size="sm" type="button" variant="ghost">
              {open ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronRight size={14} aria-hidden="true" />
              )}
              {open ? "Hide" : "Detail"}
              <span className="sr-only"> for {group.label}</span>
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent>
        <ul className="flex flex-col gap-3 border-t border-border p-3 text-sm">
          {group.entries.map((flag) => (
            <li key={flag.id} className="flex flex-wrap items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-medium">
                  {flagFieldLabel(flag.fieldPath)}
                </span>
                {flag.summary ? (
                  <span className="text-muted-foreground">{flag.summary}</span>
                ) : null}
                {flag.sourceExcerpt ? (
                  <blockquote className="border-l-2 border-border pl-3 whitespace-pre-wrap text-muted-foreground">
                    {flag.sourceExcerpt}
                  </blockquote>
                ) : null}
                {flag.resolutionNote ? (
                  <span className="text-xs text-muted-foreground">
                    Note: {flag.resolutionNote}
                  </span>
                ) : null}
              </div>
              <StatusBadge status={flag.status} />
              {flag.status === "open" ? (
                <Button
                  disabled={disabled}
                  onClick={() =>
                    run(() =>
                      resolveReviewEntryAction({
                        entryId: flag.id,
                        status: "acknowledged",
                        path,
                      }),
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Acknowledge
                </Button>
              ) : (
                <ReopenButton
                  disabled={disabled}
                  flag={flag}
                  path={path}
                  run={run}
                />
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The changes are decisions over a fixed schema, so they read as a table. They
 * are grouped by the part of the record they belong to, and the table opens on
 * what is still outstanding so a reviewer works a queue rather than a wall.
 */
function ChangeSection({
  changes,
  disabled,
  editable,
  path,
  reviewId,
  run,
  sourceHref,
}: {
  changes: ReviewEntry[];
  disabled: boolean;
  editable: boolean;
  path: string;
  reviewId: string;
  run: Run;
  sourceHref: string;
}) {
  const open = changes.filter((entry) => entry.status === "open");
  // Every change is shown until the reviewer asks for the queue, because a row
  // that vanishes the moment it is decided takes its own Undo with it.
  const [filter, setFilter] = useState<ChangeFilter>("all");
  const groups = groupChanges(changes);
  const visible = (entries: ReviewEntry[]) =>
    filter === "all"
      ? entries
      : entries.filter((entry) => entry.status === filter);
  const shown = groups.reduce(
    (total, group) => total + visible(group.entries).length,
    0,
  );

  return (
    <section
      aria-labelledby={`changes-${reviewId}`}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`changes-${reviewId}`} className="text-sm font-semibold">
          Changes{" "}
          <span className="font-normal text-muted-foreground">
            {changes.length === 0
              ? "none"
              : shown === changes.length
                ? changes.length
                : `${shown} of ${changes.length}`}
          </span>
        </h3>
        {changes.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Progress
                aria-label={`${changes.length - open.length} of ${changes.length} decided`}
                className="w-28"
                value={((changes.length - open.length) / changes.length) * 100}
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                {changes.length - open.length} of {changes.length} decided
              </span>
            </div>
            {/* Named the way the sort menu is, so the control says what it
                does and which view is on rather than only the latter. */}
            <OptionPicker
              aria-label={`Show: ${
                CHANGE_FILTERS.find((option) => option.value === filter)?.label
              }`}
              items={CHANGE_FILTERS}
              onValueChange={(value) => setFilter(value as ChangeFilter)}
              searchable={false}
              size="sm"
              value={filter}
            />
          </div>
        ) : null}
      </div>
      {changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The page content matched the current draft.
        </p>
      ) : shown === 0 ? (
        <p className="text-sm text-muted-foreground">
          No change is{" "}
          {CHANGE_FILTERS.find(
            (option) => option.value === filter,
          )?.label.toLowerCase()}
          . Choose another view to see the rest.
        </p>
      ) : (
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
                Every field the import changed, grouped by the part of the
                record it belongs to, with the current value, the imported value
                and the decision taken
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
                {groups.map((group) => {
                  const rows = visible(group.entries);
                  if (rows.length === 0) return null;
                  return (
                    <ChangeGroupRows
                      key={group.key}
                      disabled={disabled}
                      editable={editable}
                      group={group}
                      path={path}
                      rows={rows}
                      run={run}
                      sourceHref={sourceHref}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </DataTableShell>
        </div>
      )}
    </section>
  );
}

function ChangeGroupRows({
  disabled,
  editable,
  group,
  path,
  rows,
  run,
  sourceHref,
}: {
  disabled: boolean;
  editable: boolean;
  group: ChangeGroup;
  path: string;
  rows: ReviewEntry[];
  run: Run;
  sourceHref: string;
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableHead className="py-2" colSpan={5} scope="colgroup">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-sm font-semibold text-foreground">
                {group.label}
              </span>
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {rows.length === group.entries.length
                  ? `${group.entries.length} ${group.entries.length === 1 ? "change" : "changes"}`
                  : `${rows.length} of ${group.entries.length}`}
              </span>
              {group.note ? (
                <p className="text-xs font-normal text-muted-foreground">
                  {group.note}
                </p>
              ) : null}
            </div>
            {editable && group.open.length > 0 ? (
              <Button
                disabled={disabled}
                onClick={() =>
                  run(() =>
                    resolveReviewEntriesAction({
                      entryIds: group.open.map((entry) => entry.id),
                      status: "accepted",
                      path,
                    }),
                  )
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Check size={14} aria-hidden="true" />
                Accept {group.open.length} in {group.label.toLowerCase()}
              </Button>
            ) : null}
          </div>
        </TableHead>
      </TableRow>
      {rows.map((change) => (
        <ChangeRows
          key={change.id}
          change={change}
          disabled={disabled}
          editable={editable}
          path={path}
          run={run}
          sourceHref={sourceHref}
        />
      ))}
    </>
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

function ChangeRows({
  change,
  disabled,
  editable,
  path,
  run,
  sourceHref,
}: {
  change: ReviewEntry;
  disabled: boolean;
  editable: boolean;
  path: string;
  run: Run;
  sourceHref: string;
}) {
  const detailId = useId();
  const [open, setOpen] = useState(false);
  const nested = isNested(change.oldValue) || isNested(change.newValue);
  const expandable = nested || Boolean(change.sourceExcerpt);
  const source = anuSourceLocation(sourceHref, change.sourceLocator);
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
          {/* A link that names where the value was read earns its colour. One
              that can only reach the top of the page keeps out of the way. */}
          <Link
            className={`inline-flex items-start gap-1 text-xs underline-offset-4 hover:underline ${
              source.label ? "text-primary" : "text-muted-foreground"
            }`}
            href={source.href}
            rel="noreferrer"
            target="_blank"
          >
            <span className="break-words">
              {source.label ? `${source.label} on the ANU page` : "ANU page"}
            </span>
            <ExternalLink
              size={11}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
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
