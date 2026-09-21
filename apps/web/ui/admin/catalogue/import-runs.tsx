"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@coursemap/ui/primitives/sheet";
import { OctagonX, TriangleAlert, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CATALOGUE_KIND_LABELS,
  DEFAULT_IMPORT_RECORD_SORT,
  IMPORT_RECORD_STATUSES,
  type CatalogueKind,
  type ImportRecordRow,
  type ImportRecordsPage,
  type ImportRunProgress,
  type ImportRunRow,
  type ImportTargetDetail,
} from "@/lib/coursemap/catalogue-kinds";
import { FilterBar } from "@/ui/common/filter-bar";
import { Pagination } from "@/ui/common/pagination";
import { SortMenu } from "@/ui/common/sort-menu";
import { badgeVariantForTone, type Tone } from "@/lib/ui";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import {
  CatalogueIdentity,
  DataTableShell,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/admin/catalogue-table/catalogue-table";
import { CatalogueRowActions } from "@/ui/admin/catalogue-table/catalogue-row-actions";
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { DataTableShell as PlainTableShell } from "@/ui/common/data-table";
import {
  Table as PlainTable,
  TableBody as PlainTableBody,
  TableCaption as PlainTableCaption,
  TableCell as PlainTableCell,
  TableHead as PlainTableHead,
  TableHeader as PlainTableHeader,
  TableRow as PlainTableRow,
} from "@coursemap/ui/primitives/table";
import { ArtefactViewer } from "./artefact-viewer";
import {
  RunStatusBadge,
  TARGET_STATUS,
  TargetStatusBadge,
} from "./workflow-badge";

function readable(value: string) {
  const words = value.replaceAll("_", " ").replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Milliseconds below a second, seconds above it. "12596ms" is not a span. */
function elapsed(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "-";
  if (milliseconds < 1_000) return `${milliseconds}ms`;
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

function duration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return "-";
  return elapsed(
    new Date(completedAt).getTime() - new Date(startedAt).getTime(),
  );
}

const STAGE_TONE: Record<string, Tone> = {
  completed: "success",
  failed: "danger",
  running: "info",
  queued: "neutral",
};

const STAGE_LABELS: Record<string, string> = {
  source_fetch: "Fetch page",
  html_capture: "Capture HTML",
  markdown_normalise: "Normalise Markdown",
  model_input_prepare: "Prepare model input",
  deterministic_extract: "Deterministic parse",
  model_extract: "Model extraction",
  schema_validate: "Validate schema",
  domain_validate: "Merge and validate",
  database_project: "Project rows",
  snapshot_persist: "Save snapshot",
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCost(value: number) {
  return value === 0 ? "No cost" : `US$${value.toFixed(4)}`;
}

function runOptionLabel(run: ImportRunRow) {
  return `#${run.runNumber} · ${run.academicYear} · ${formatDateTime(run.createdAt)}`;
}

/**
 * Every record an import has produced for one kind, newest first, across every
 * run. The run is a column and a filter rather than a table of its own: a
 * stacked run list over a run's records read as two disconnected pages, and an
 * administrator looks for a record, not for the batch that carried it.
 *
 * Selecting a record opens its pipeline: the stages it ran, the model's cost
 * and diagnostics, and the artefacts each stage saved.
 */
export function ImportRecords({
  page,
  basePath,
  kind,
  loadTarget,
  readRunProgress,
}: {
  page: ImportRecordsPage;
  basePath: string;
  kind: CatalogueKind;
  loadTarget: (targetId: string) => Promise<ImportTargetDetail | null>;
  readRunProgress: (runId: string) => Promise<ImportRunProgress | null>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const labels = CATALOGUE_KIND_LABELS[kind];
  const importsPath = `${basePath}/imports`;
  const selectedTargetId = searchParams.get("target");
  const [detail, setDetail] = useState<ImportTargetDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<{
    runId: string;
    value: ImportRunProgress;
  } | null>(null);

  // The chosen run if there is one, else the newest run still working, so a
  // list left unfiltered still keeps up with an import that is under way.
  const activeRun =
    page.run && (page.run.status === "queued" || page.run.status === "running")
      ? page.run
      : page.run
        ? null
        : (page.runs.find(
            (run) => run.status === "queued" || run.status === "running",
          ) ?? null);
  const watchedRunId = activeRun?.id ?? null;
  const lastCounters = useRef<string | null>(null);

  // Watching one run's counters costs a single row. Refetching the whole page
  // every four seconds reread every record to learn that one number had moved,
  // and reset the reader's scroll position each time. The rows are reread only
  // when a record actually finished, or when the run itself settled.
  useEffect(() => {
    if (!watchedRunId) return;
    let cancelled = false;
    lastCounters.current = null;
    const tick = async () => {
      const next = await readRunProgress(watchedRunId);
      if (cancelled || !next) return;
      setProgress({ runId: watchedRunId, value: next });
      const counters = `${next.completedCount}:${next.failedCount}`;
      const settled = next.status !== "queued" && next.status !== "running";
      if (
        lastCounters.current !== null &&
        (counters !== lastCounters.current || settled)
      ) {
        router.refresh();
      }
      lastCounters.current = counters;
    };
    const timer = setInterval(() => void tick(), 4000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [watchedRunId, readRunProgress, router]);

  /** The chosen run's counters as of the last poll, when it is the watched one. */
  const live =
    progress && page.run && progress.runId === page.run.id
      ? progress.value
      : null;

  // Closing the sheet does not clear the detail. `visibleDetail` below shows
  // one only while it belongs to the selected record, so the last one read
  // stays cached for a reopen rather than costing a second round trip.
  useEffect(() => {
    if (!selectedTargetId) return;
    let cancelled = false;
    loadTarget(selectedTargetId).then((value) => {
      if (!cancelled) setDetail(value);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTargetId, loadTarget]);
  const visibleDetail =
    selectedTargetId && detail?.id === selectedTargetId ? detail : null;

  function select(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${importsPath}?${query}` : importsPath, {
      scroll: false,
    });
  }

  async function cancelRun(runId: string) {
    setCancelling(true);
    try {
      const response = await fetch("/api/admin/catalogue-imports", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const body = (await response.json()) as {
        error?: string;
        cancelled?: number;
      };
      if (!response.ok)
        throw new Error(body.error ?? "The run could not be stopped.");
      toast.success(
        `Stopped ${body.cancelled ?? 0} record${body.cancelled === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The run could not be stopped.",
      );
    } finally {
      setCancelling(false);
    }
  }

  const chosenRun = page.run;
  const filtered = Boolean(
    searchParams.get("q") ??
    searchParams.get("status") ??
    searchParams.get("run"),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <FilterBar
            searchPlaceholder={`Search imported ${labels.plural.toLowerCase()} by code or title`}
            filters={[
              {
                key: "status",
                label: "Outcome",
                allLabel: "Any outcome",
                options: IMPORT_RECORD_STATUSES.map((value) => ({
                  value,
                  label: TARGET_STATUS[value]?.label ?? readable(value),
                })),
              },
              ...(page.runs.length > 0
                ? [
                    {
                      key: "run",
                      label: "Run",
                      allLabel: "Every run",
                      options: page.runs.map((run) => ({
                        value: run.id,
                        label: runOptionLabel(run),
                      })),
                    },
                  ]
                : []),
            ]}
          />
        </div>
        <SortMenu
          defaultValue={DEFAULT_IMPORT_RECORD_SORT}
          onChange={(value) => select({ sort: value, page: null })}
          options={[
            { value: "newest", label: "Newest first", descending: true },
            { value: "oldest", label: "Oldest first" },
            { value: "code-asc", label: "Code, A to Z" },
            { value: "code-desc", label: "Code, Z to A", descending: true },
          ]}
          value={page.sort}
        />
      </div>

      {chosenRun ? (
        <RunStrip
          cancelling={cancelling}
          live={live}
          onCancel={() => void cancelRun(chosenRun.id)}
          onClear={() => select({ run: null, page: null })}
          run={chosenRun}
        />
      ) : null}

      <DataTableShell
        imports
        footer={
          <Pagination
            alwaysShowControls
            itemName="records"
            page={page.page}
            pageSize={page.pageSize}
            pathname={importsPath}
            searchParams={Object.fromEntries(searchParams.entries())}
            total={page.total}
          />
        }
      >
        {page.records.length === 0 ? (
          <CatalogueEmpty
            imports
            filtered={filtered}
            clearHref={importsPath}
            title={`No ${labels.plural.toLowerCase()} have been imported`}
            description={`Select ${labels.plural.toLowerCase()} in the directory and start an import to see them here.`}
          >
            <Button asChild variant="outline">
              <Link href={basePath}>Open the directory</Link>
            </Button>
          </CatalogueEmpty>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              {labels.singular} imports, {SORT_CAPTIONS[page.sort]}
            </TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Import</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.records.map((record) => (
                <RecordRow
                  basePath={basePath}
                  key={record.id}
                  kind={kind}
                  onOpenPipeline={() => select({ target: record.id })}
                  onSelectRun={() =>
                    select({ run: record.runId, page: null, target: null })
                  }
                  record={record}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </DataTableShell>

      <Sheet
        open={Boolean(selectedTargetId)}
        onOpenChange={(open) => {
          if (!open) select({ target: null });
        }}
      >
        <SheetContent
          aria-describedby={undefined}
          className="w-full gap-0 overflow-y-auto p-0 sm:max-w-3xl"
          side="right"
        >
          {visibleDetail ? (
            <TargetDetail detail={visibleDetail} />
          ) : (
            <div aria-busy="true" className="flex flex-col gap-4 p-4">
              <SheetTitle className="sr-only">Loading the pipeline</SheetTitle>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72 max-w-full" />
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const SORT_CAPTIONS: Record<ImportRecordsPage["sort"], string> = {
  newest: "newest first",
  oldest: "oldest first",
  "code-asc": "by code, A to Z",
  "code-desc": "by code, Z to A",
};

function RecordRow({
  basePath,
  kind,
  onOpenPipeline,
  onSelectRun,
  record,
}: {
  basePath: string;
  kind: CatalogueKind;
  onOpenPipeline: () => void;
  onSelectRun: () => void;
  record: ImportRecordRow;
}) {
  const failure =
    record.errorMessage ||
    (record.errorCode ? readable(record.errorCode) : null);
  const reviewHref =
    record.status === "ready" && record.recordPublicId
      ? `${basePath}/${record.code}?year=${record.academicYear}&tab=review`
      : undefined;
  return (
    <LinkedTableRow>
      <TableCell>
        <CatalogueIdentity
          code={record.code}
          title={record.title ?? record.code}
          kind={kind}
          href={reviewHref}
        />
      </TableCell>
      <TableCell className="text-xs tabular-nums">
        {record.academicYear}
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <TargetStatusBadge
            status={record.status}
            applied={record.appliedVersionId !== null}
          />
          {/* Why it failed, so a column of "Failed" badges can be told apart
              without opening each pipeline in turn. The message is written for
              a reader; the code is a machine token, so it is only the fallback
              when nothing wrote a message. */}
          {failure ? (
            <span className="line-clamp-2 text-[11px] text-destructive">
              {failure}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {record.changeKind ? (
          readable(record.changeKind)
        ) : (
          <span className="text-muted-foreground/80">None</span>
        )}
      </TableCell>
      <TableCell>
        {/* The run narrows the same list rather than opening a second one. */}
        <button
          className="cursor-pointer text-xs tabular-nums underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          onClick={onSelectRun}
          title={`Show only run ${record.runNumber}`}
          type="button"
        >
          #{record.runNumber}
        </button>
      </TableCell>
      <TableCell>
        <time
          className="text-xs text-muted-foreground tabular-nums"
          dateTime={record.createdAt}
        >
          {formatDateTime(record.createdAt)}
        </time>
      </TableCell>
      <TableCell className="text-right">
        <CatalogueRowActions
          code={record.code}
          extraActions={[
            {
              label: "Show pipeline",
              icon: <Workflow size={15} />,
              onSelect: onOpenPipeline,
            },
          ]}
          links={[
            ...(reviewHref
              ? [{ label: "Review import", href: reviewHref }]
              : []),
            ...(record.recordPublicId
              ? [
                  {
                    label: "Import history",
                    href: `${basePath}/${record.code}?year=${record.academicYear}&tab=history`,
                    icon: "history" as const,
                  },
                ]
              : []),
            {
              label: "Find in directory",
              href: `${basePath}?q=${encodeURIComponent(record.code)}&year=${record.academicYear}`,
            },
          ]}
        />
      </TableCell>
    </LinkedTableRow>
  );
}

/**
 * The chosen run, one line: what it cost, how far it got and how to stop it.
 * It replaces the run table, and appears only while a run is the filter, so an
 * unfiltered list is a single table rather than a master and a detail.
 */
function RunStrip({
  cancelling,
  live,
  onCancel,
  onClear,
  run,
}: {
  cancelling: boolean;
  live: ImportRunProgress | null;
  onCancel: () => void;
  onClear: () => void;
  run: ImportRunRow;
}) {
  const completed = live?.completedCount ?? run.completedCount;
  const failed = live?.failedCount ?? run.failedCount;
  const total = live?.targetCount ?? run.targetCount;
  const status = live?.status ?? run.status;
  return (
    <section
      aria-label={`Run ${run.runNumber}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs"
    >
      <h2 className="text-sm font-medium tabular-nums">Run #{run.runNumber}</h2>
      <RunStatusBadge status={status} />
      <span className="text-muted-foreground tabular-nums">
        {completed}/{total} done
        {failed ? (
          <span className="text-destructive"> · {failed} failed</span>
        ) : null}
      </span>
      <span className="truncate text-muted-foreground">
        {run.requestedModel}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {formatCost(run.costUsd)}
      </span>
      <time
        className="text-muted-foreground tabular-nums"
        dateTime={run.createdAt}
      >
        {formatDateTime(run.createdAt)}
      </time>
      <div className="ms-auto flex items-center gap-2">
        {status === "queued" || status === "running" ? (
          <Button
            disabled={cancelling}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            <OctagonX size={16} aria-hidden="true" />
            Stop run
          </Button>
        ) : null}
        <Button onClick={onClear} size="sm" type="button" variant="ghost">
          Show every run
        </Button>
      </div>
    </section>
  );
}

function TargetDetail({ detail }: { detail: ImportTargetDetail }) {
  const latestAttempt = Math.max(
    1,
    ...detail.stages.map((stage) => stage.attemptNumber),
  );
  const stages = detail.stages.filter(
    (stage) => stage.attemptNumber === latestAttempt,
  );
  return (
    <>
      <SheetHeader className="border-b border-border">
        <SheetTitle>{detail.code} pipeline</SheetTitle>
        <SheetDescription>
          Attempt {latestAttempt}
          {detail.extraction?.resolvedModel
            ? ` · ${detail.extraction.resolvedModel}`
            : ""}
        </SheetDescription>
      </SheetHeader>
      <div className="flex min-w-0 flex-col gap-4 p-4">
        {detail.extraction ? (
          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Input</dt>
              <dd className="mt-1 tabular-nums">
                {detail.extraction.inputTokens.toLocaleString("en-AU")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Output</dt>
              <dd className="mt-1 tabular-nums">
                {detail.extraction.outputTokens.toLocaleString("en-AU")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cost</dt>
              <dd className="mt-1 tabular-nums">
                {formatCost(detail.extraction.costUsd)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latency</dt>
              <dd className="mt-1 tabular-nums">
                {detail.extraction.latencyMs === null
                  ? "-"
                  : elapsed(detail.extraction.latencyMs)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Diagnostics</dt>
              <dd className="mt-1 tabular-nums">
                {detail.extraction.warningCount} warnings ·{" "}
                {detail.extraction.errorCount} errors
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Validation</dt>
              <dd className="mt-1">
                <Badge
                  variant={
                    badgeVariantForTone[
                      STAGE_TONE[detail.extraction.validationStatus] ??
                        "neutral"
                    ]
                  }
                >
                  {readable(detail.extraction.validationStatus)}
                </Badge>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">
            No model extraction recorded.
          </p>
        )}
        {detail.extraction?.finishReason === "length" ? (
          <Alert variant="warning">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>The model ran out of output tokens</AlertTitle>
            <AlertDescription>
              The extraction kept only the deterministic data. Choose a model
              with a larger output budget for this record.
            </AlertDescription>
          </Alert>
        ) : null}
        {detail.extraction?.errorSummary ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Validation details</summary>
            <p className="mt-2">{detail.extraction.errorSummary}</p>
          </details>
        ) : null}
        <div
          className="min-w-0 overflow-x-auto"
          role="region"
          aria-label="Pipeline stages"
          data-scroll-kind="table"
          tabIndex={0}
        >
          <PlainTableShell>
            <PlainTable className="min-w-[640px]">
              <PlainTableCaption className="sr-only">
                Import pipeline stages
              </PlainTableCaption>
              <PlainTableHeader>
                <PlainTableRow className="hover:bg-transparent">
                  <PlainTableHead className="w-12">Step</PlainTableHead>
                  <PlainTableHead>Stage</PlainTableHead>
                  <PlainTableHead>Status</PlainTableHead>
                  <PlainTableHead className="text-right">
                    Duration
                  </PlainTableHead>
                  <PlainTableHead>Error</PlainTableHead>
                </PlainTableRow>
              </PlainTableHeader>
              <PlainTableBody>
                {stages.length === 0 ? (
                  <PlainTableRow>
                    <PlainTableCell
                      className="text-xs text-muted-foreground"
                      colSpan={5}
                    >
                      No stages were recorded for this attempt.
                    </PlainTableCell>
                  </PlainTableRow>
                ) : null}
                {stages.map((stage, index) => (
                  <PlainTableRow key={stage.id}>
                    <PlainTableCell className="text-xs text-muted-foreground tabular-nums">
                      {index + 1}
                    </PlainTableCell>
                    <PlainTableCell className="text-xs font-medium text-foreground/90">
                      {STAGE_LABELS[stage.name] ?? readable(stage.name)}
                    </PlainTableCell>
                    <PlainTableCell>
                      <Badge
                        variant={
                          badgeVariantForTone[
                            STAGE_TONE[stage.status] ?? "neutral"
                          ]
                        }
                      >
                        {readable(stage.status)}
                      </Badge>
                    </PlainTableCell>
                    <PlainTableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {duration(stage.startedAt, stage.completedAt)}
                    </PlainTableCell>
                    <PlainTableCell className="max-w-72 text-xs">
                      {stage.errorSummary ? (
                        <span className="text-destructive">
                          {stage.errorCode ? `${stage.errorCode}: ` : ""}
                          {stage.errorSummary}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{"-"}</span>
                      )}
                    </PlainTableCell>
                  </PlainTableRow>
                ))}
              </PlainTableBody>
            </PlainTable>
          </PlainTableShell>
        </div>
        <section
          aria-label="Import artefacts"
          className="flex min-h-0 min-w-0 flex-col gap-2"
        >
          <h3 className="text-sm font-semibold">Artefacts</h3>
          <ArtefactViewer
            artifacts={detail.artifacts.filter(
              (artifact) => artifact.attemptNumber === latestAttempt,
            )}
            endpoint="/api/admin/catalogue-imports/artifacts"
          />
        </section>
      </div>
    </>
  );
}
