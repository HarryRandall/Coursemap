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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import { LoaderCircle, OctagonX, TriangleAlert, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  CATALOGUE_KIND_LABELS,
  DEFAULT_IMPORT_RUN_SORT,
  IMPORT_RUN_STATUSES,
  type CatalogueKind,
  type ImportRunProgress,
  type ImportRunsPage,
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
import { TargetStatusBadge } from "./workflow-badge";

const RUN_TONE: Record<string, Tone> = {
  queued: "info",
  running: "info",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

function readable(value: string) {
  const words = value.replaceAll("_", " ").replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function duration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return "\u2014";
  const milliseconds =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "\u2014";
  if (milliseconds < 1_000) return `${milliseconds}ms`;
  return `${(milliseconds / 1_000).toFixed(1)}s`;
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
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCost(value: number) {
  return value === 0 ? "No cost" : `US$${value.toFixed(4)}`;
}

/** Run history for one kind with per-target stages and artefacts. */
export function ImportRuns({
  page,
  basePath,
  kind,
  loadTarget,
  readRunProgress,
}: {
  page: ImportRunsPage;
  basePath: string;
  kind: CatalogueKind;
  loadTarget: (targetId: string) => Promise<ImportTargetDetail | null>;
  readRunProgress: (runId: string) => Promise<ImportRunProgress | null>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const labels = CATALOGUE_KIND_LABELS[kind];
  const runs = page.runs;
  const run = page.selected;
  const selectedTargetId = searchParams.get("target");
  const [detail, setDetail] = useState<ImportTargetDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<{
    runId: string;
    value: ImportRunProgress;
  } | null>(null);

  // Watching one run's counters costs a single row. Refetching the whole page
  // every four seconds reread every run and every target to learn that one
  // number had moved, and reset the reader's scroll position each time.
  const watchedRunId =
    run && (run.status === "queued" || run.status === "running")
      ? run.id
      : null;
  useEffect(() => {
    if (!watchedRunId) return;
    let cancelled = false;
    const tick = async () => {
      const next = await readRunProgress(watchedRunId);
      if (cancelled || !next) return;
      setProgress({ runId: watchedRunId, value: next });
      // The run has settled, so the rows and their targets are worth rereading.
      if (next.status !== "queued" && next.status !== "running") {
        router.refresh();
      }
    };
    const timer = setInterval(() => void tick(), 4000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [watchedRunId, readRunProgress, router]);

  /** The watched run's counters, as of the last poll. */
  const live =
    progress && run && progress.runId === run.id ? progress.value : null;

  const targetKey = selectedTargetId
    ? `${selectedTargetId}:${run?.completedCount ?? 0}:${run?.status ?? ""}`
    : null;
  useEffect(() => {
    if (!targetKey || !selectedTargetId) return;
    let cancelled = false;
    loadTarget(selectedTargetId).then((value) => {
      if (!cancelled) setDetail(value);
    });
    return () => {
      cancelled = true;
    };
  }, [targetKey, selectedTargetId, loadTarget]);
  const visibleDetail =
    selectedTargetId && detail?.id === selectedTargetId ? detail : null;

  function select(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.replace(`${basePath}/imports?${next}`);
  }

  async function cancelRun() {
    if (!run) return;
    setCancelling(true);
    try {
      const response = await fetch("/api/admin/catalogue-imports", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      const body = (await response.json()) as {
        error?: string;
        cancelled?: number;
      };
      if (!response.ok)
        throw new Error(body.error ?? "The run could not be stopped.");
      toast.success(
        `Stopped ${body.cancelled ?? 0} target${body.cancelled === 1 ? "" : "s"}.`,
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

  const filtered = Boolean(searchParams.get("q") ?? searchParams.get("status"));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-start gap-2">
        <FilterBar
          searchPlaceholder={`Search runs by ${labels.singular.toLowerCase()} code or model`}
          filters={[
            {
              key: "status",
              label: "Status",
              allLabel: "All statuses",
              options: IMPORT_RUN_STATUSES.map((value) => ({
                value,
                label: readable(value),
              })),
            },
          ]}
        />
        <SortMenu
          defaultValue={DEFAULT_IMPORT_RUN_SORT}
          onChange={(value) => select({ sort: value, page: null })}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "records", label: "Most records" },
            { value: "cost", label: "Highest cost" },
          ]}
          value={page.sort}
        />
      </div>
      <div
        className="min-w-0 overflow-x-auto"
        role="region"
        aria-label="Import runs"
        data-scroll-kind="table"
        tabIndex={0}
      >
        <PlainTableShell
          footer={
            <Pagination
              alwaysShowControls
              itemName="runs"
              page={page.page}
              pageSize={page.pageSize}
              pathname={`${basePath}/imports`}
              searchParams={Object.fromEntries(searchParams.entries())}
              total={page.total}
            />
          }
        >
          <PlainTable className="min-w-[760px]">
            <PlainTableCaption className="sr-only">
              Import runs for {labels.plural.toLowerCase()}, newest first
            </PlainTableCaption>
            <PlainTableHeader>
              <PlainTableRow className="hover:bg-transparent">
                <PlainTableHead className="w-20">Run</PlainTableHead>
                <PlainTableHead className="w-20">Year</PlainTableHead>
                <PlainTableHead>Status</PlainTableHead>
                <PlainTableHead className="text-right">Records</PlainTableHead>
                <PlainTableHead>Model</PlainTableHead>
                <PlainTableHead className="text-right">Cost</PlainTableHead>
                <PlainTableHead>Started</PlainTableHead>
              </PlainTableRow>
            </PlainTableHeader>
            <PlainTableBody>
              {runs.length === 0 ? (
                <PlainTableRow>
                  <PlainTableCell colSpan={7}>
                    <CatalogueEmpty
                      imports
                      filtered={filtered}
                      clearHref={`${basePath}/imports`}
                      title={
                        filtered
                          ? "No runs match those filters"
                          : `No ${labels.singular.toLowerCase()} imports yet`
                      }
                      description={
                        filtered
                          ? "Clear the filters to see every run."
                          : `Select ${labels.plural.toLowerCase()} in the directory and start an import to see runs here.`
                      }
                    >
                      <Button asChild variant="outline">
                        <Link href={basePath}>Open the directory</Link>
                      </Button>
                    </CatalogueEmpty>
                  </PlainTableCell>
                </PlainTableRow>
              ) : null}
              {runs.map((candidate) => {
                const current = candidate.id === run?.id;
                return (
                  <PlainTableRow
                    key={candidate.id}
                    aria-current={current ? "true" : undefined}
                    className="aria-[current=true]:bg-primary/5"
                  >
                    <PlainTableCell>
                      <button
                        type="button"
                        onClick={() =>
                          select({ run: candidate.id, target: null })
                        }
                        aria-current={current ? "true" : undefined}
                        className="text-xs font-medium tabular-nums underline-offset-4 hover:underline aria-[current=true]:text-primary"
                      >
                        #{candidate.runNumber}
                      </button>
                    </PlainTableCell>
                    <PlainTableCell className="text-xs tabular-nums">
                      {candidate.academicYear}
                    </PlainTableCell>
                    <PlainTableCell>
                      <Badge
                        variant={
                          badgeVariantForTone[
                            RUN_TONE[candidate.status] ?? "neutral"
                          ]
                        }
                      >
                        {candidate.status === "running" ? (
                          <LoaderCircle
                            size={11}
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        ) : null}
                        {readable(candidate.status)}
                      </Badge>
                    </PlainTableCell>
                    <PlainTableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {current && live
                        ? `${live.completedCount}/${live.targetCount}`
                        : `${candidate.completedCount}/${candidate.targetCount}`}
                      {candidate.failedCount ? (
                        <span className="text-destructive">
                          {" "}
                          · {candidate.failedCount} failed
                        </span>
                      ) : null}
                    </PlainTableCell>
                    <PlainTableCell className="truncate text-xs text-muted-foreground">
                      {candidate.requestedModel}
                    </PlainTableCell>
                    <PlainTableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {formatCost(candidate.costUsd)}
                    </PlainTableCell>
                    <PlainTableCell>
                      <time
                        className="text-xs text-muted-foreground tabular-nums"
                        dateTime={candidate.createdAt}
                      >
                        {formatDateTime(candidate.createdAt)}
                      </time>
                    </PlainTableCell>
                  </PlainTableRow>
                );
              })}
            </PlainTableBody>
          </PlainTable>
        </PlainTableShell>
      </div>

      {run ? (
        <div className="flex min-h-0 flex-col gap-4 overflow-auto">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>
                  <h2>
                    Run #{run.runNumber} · {run.academicYear}{" "}
                    {labels.plural.toLowerCase()}
                  </h2>
                </CardTitle>
                <CardDescription>
                  {run.requestedModel} · {formatCost(run.costUsd)} · started{" "}
                  {formatDateTime(run.createdAt)}
                  {run.completedAt
                    ? `, finished ${formatDateTime(run.completedAt)}`
                    : ""}
                </CardDescription>
              </div>
              {run.status === "queued" || run.status === "running" ? (
                <Button
                  variant="outline"
                  onClick={cancelRun}
                  disabled={cancelling}
                  type="button"
                >
                  <OctagonX size={16} aria-hidden="true" />
                  Stop run
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <DataTableShell imports>
                <Table>
                  <TableCaption className="sr-only">
                    Records processed by run {run.runNumber}
                  </TableCaption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Import</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.targets.map((target) => {
                      const reviewHref =
                        target.status === "ready" && target.itemYearPublicId
                          ? `${basePath}/${target.code}?year=${run.academicYear}&tab=review`
                          : undefined;
                      return (
                        <LinkedTableRow key={target.id}>
                          <TableCell>
                            <CatalogueIdentity
                              code={target.code}
                              title={target.title ?? target.code}
                              kind={kind}
                              href={reviewHref}
                            />
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {run.academicYear}
                          </TableCell>
                          <TableCell>
                            <TargetStatusBadge
                              status={target.status}
                              applied={target.appliedSnapshotId !== null}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {target.changeKind ? (
                              readable(target.changeKind)
                            ) : (
                              <span className="text-muted-foreground/80">
                                None
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {target.attemptCount}
                          </TableCell>
                          <TableCell className="text-right">
                            <CatalogueRowActions
                              code={target.code}
                              extraActions={[
                                {
                                  label:
                                    target.id === selectedTargetId
                                      ? "Hide pipeline"
                                      : "Show pipeline",
                                  icon: <Workflow size={15} />,
                                  onSelect: () =>
                                    select({
                                      target:
                                        target.id === selectedTargetId
                                          ? null
                                          : target.id,
                                    }),
                                },
                              ]}
                              links={[
                                ...(reviewHref
                                  ? [
                                      {
                                        label: "Review import",
                                        href: reviewHref,
                                      },
                                    ]
                                  : []),
                                {
                                  label: "Find in directory",
                                  href: `${basePath}?q=${encodeURIComponent(target.code)}&year=${run.academicYear}`,
                                },
                              ]}
                            />
                          </TableCell>
                        </LinkedTableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </DataTableShell>
            </CardContent>
          </Card>

          {selectedTargetId ? (
            visibleDetail ? (
              <TargetDetail detail={visibleDetail} />
            ) : (
              <Card aria-busy="true">
                <CardHeader>
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-9 w-full" />
                  ))}
                </CardContent>
              </Card>
            )
          ) : null}
        </div>
      ) : null}
    </div>
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{detail.extraction?.resolvedModel ?? detail.code}</h3>
        </CardTitle>
        <CardDescription>
          {`Extraction attempt ${latestAttempt}`}
        </CardDescription>
        {detail.extraction ? (
          <CardAction>
            <Badge
              variant={
                badgeVariantForTone[
                  STAGE_TONE[detail.extraction.validationStatus] ?? "neutral"
                ]
              }
            >
              {readable(detail.extraction.validationStatus)}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {detail.extraction ? (
          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 xl:grid-cols-5">
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
                  ? "\u2014"
                  : `${detail.extraction.latencyMs}ms`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Diagnostics</dt>
              <dd className="mt-1 tabular-nums">
                {detail.extraction.warningCount} warnings ·{" "}
                {detail.extraction.errorCount} errors
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
            <PlainTable className="min-w-[720px]">
              <PlainTableCaption className="sr-only">
                Import pipeline stages
              </PlainTableCaption>
              <PlainTableHeader>
                <PlainTableRow className="hover:bg-transparent">
                  <PlainTableHead className="w-16">Step</PlainTableHead>
                  <PlainTableHead>Stage</PlainTableHead>
                  <PlainTableHead>Status</PlainTableHead>
                  <PlainTableHead className="text-right">
                    Duration
                  </PlainTableHead>
                  <PlainTableHead>Error</PlainTableHead>
                </PlainTableRow>
              </PlainTableHeader>
              <PlainTableBody>
                {stages.map((stage, index) => {
                  return (
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
                          <span className="text-muted-foreground">-</span>
                        )}
                      </PlainTableCell>
                    </PlainTableRow>
                  );
                })}
              </PlainTableBody>
            </PlainTable>
          </PlainTableShell>
        </div>
        <section
          aria-label="Import artefacts"
          className="flex min-h-0 min-w-0 flex-col gap-2"
        >
          <h4 className="text-sm font-semibold">Artefacts</h4>
          <ArtefactViewer
            artifacts={detail.artifacts.filter(
              (artifact) => artifact.attemptNumber === latestAttempt,
            )}
            endpoint="/api/admin/catalogue-imports/artifacts"
          />
        </section>
      </CardContent>
    </Card>
  );
}
