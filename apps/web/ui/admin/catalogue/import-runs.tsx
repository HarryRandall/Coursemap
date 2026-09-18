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
import {
  Check,
  CircleX,
  ExternalLink,
  LoaderCircle,
  OctagonX,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  CATALOGUE_KIND_LABELS,
  type ImportRunSummary,
  type ImportTargetDetail,
} from "@/lib/coursemap/catalogue-kinds";
import { badgeVariantForTone, type Tone } from "@/lib/ui";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { TargetStatusBadge } from "./workflow-badge";

const RUN_TONE: Record<string, Tone> = {
  queued: "info",
  running: "info",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
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

const ARTIFACT_LABELS: Record<string, string> = {
  raw_html: "Raw HTML",
  normalised_markdown: "Markdown",
  model_input: "Model input",
  deterministic_output: "Deterministic output",
  model_request: "Model request",
  model_response: "Model response",
  validated_json: "Merged extraction",
  validation_report: "Validation report",
  database_projection: "Projection",
  change_set: "Change set",
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

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function durationMs(start: string, end: string | null) {
  if (!end) return null;
  return new Date(end).getTime() - new Date(start).getTime();
}

/** Run history for one kind with per-target stages and artefacts. */
export function ImportRuns({
  runs,
  basePath,
  kind,
  loadTarget,
}: {
  runs: ImportRunSummary[];
  basePath: string;
  kind: ImportRunSummary["kind"];
  loadTarget: (targetId: string) => Promise<ImportTargetDetail | null>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const labels = CATALOGUE_KIND_LABELS[kind];
  const selectedRunId = searchParams.get("run") ?? runs[0]?.id ?? null;
  const selectedTargetId = searchParams.get("target");
  const run =
    runs.find((candidate) => candidate.id === selectedRunId) ?? runs[0] ?? null;
  const [detail, setDetail] = useState<ImportTargetDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const active = runs.some(
    (candidate) =>
      candidate.status === "queued" || candidate.status === "running",
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);

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

  if (runs.length === 0) {
    return (
      <CatalogueEmpty
        title={`No ${labels.singular.toLowerCase()} imports yet`}
        description={`Select ${labels.plural.toLowerCase()} in the directory and start an import to see runs here.`}
        imports
      >
        <Button asChild variant="outline">
          <Link href={basePath}>Open the directory</Link>
        </Button>
      </CatalogueEmpty>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
      <nav aria-label="Import runs" className="min-h-0 overflow-auto">
        <ul className="flex flex-col gap-2">
          {runs.map((candidate) => {
            const current = candidate.id === run?.id;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  onClick={() => select({ run: candidate.id, target: null })}
                  className="flex w-full flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent aria-[current=true]:border-primary aria-[current=true]:bg-primary/5"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      Run #{candidate.runNumber}
                    </span>
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
                      {candidate.status}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {candidate.academicYear} · {candidate.completedCount}/
                    {candidate.targetCount} done
                    {candidate.failedCount
                      ? `, ${candidate.failedCount} failed`
                      : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(candidate.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

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
              <ul className="divide-y divide-border">
                {run.targets.map((target) => {
                  const current = target.id === selectedTargetId;
                  return (
                    <li
                      key={target.id}
                      className="flex flex-wrap items-center gap-3 py-2"
                    >
                      <button
                        type="button"
                        aria-current={current ? "true" : undefined}
                        onClick={() =>
                          select({ target: current ? null : target.id })
                        }
                        className="font-mono text-sm font-medium underline-offset-4 hover:underline aria-[current=true]:text-primary"
                      >
                        {target.code}
                      </button>
                      <TargetStatusBadge status={target.status} />
                      {target.changeKind ? (
                        <span className="text-xs text-muted-foreground">
                          {target.changeKind === "new"
                            ? "First snapshot"
                            : target.changeKind === "changed"
                              ? "Content changed"
                              : "No change"}
                        </span>
                      ) : null}
                      {target.attemptCount > 1 ? (
                        <span className="text-xs text-muted-foreground">
                          {target.attemptCount} attempts
                        </span>
                      ) : null}
                      {target.errorMessage ? (
                        <span className="text-xs text-destructive">
                          {target.errorMessage}
                        </span>
                      ) : null}
                      {target.status === "ready" && target.itemYearPublicId ? (
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                        >
                          <Link
                            href={`${basePath}/${target.code}?year=${run.academicYear}&tab=review`}
                          >
                            Review
                            <ExternalLink size={14} aria-hidden="true" />
                          </Link>
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {selectedTargetId ? (
            visibleDetail ? (
              <TargetDetail detail={visibleDetail} />
            ) : (
              <p className="text-sm text-muted-foreground">Loading target…</p>
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
  const artifactsByStage = new Map<string, ImportTargetDetail["artifacts"]>();
  for (const artifact of detail.artifacts) {
    const list = artifactsByStage.get(artifact.stageId) ?? [];
    list.push(artifact);
    artifactsByStage.set(artifact.stageId, list);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>
            {detail.code} · attempt {latestAttempt}
          </h3>
        </CardTitle>
        <CardDescription>
          {detail.extraction
            ? `${detail.extraction.resolvedModel ?? "model"} · ${detail.extraction.inputTokens} in / ${detail.extraction.outputTokens} out · ${formatCost(detail.extraction.costUsd)} · ${detail.extraction.warningCount} warnings, ${detail.extraction.errorCount} errors`
            : "No model extraction recorded."}
          {detail.extraction?.errorSummary
            ? ` ${detail.extraction.errorSummary}`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {stages.map((stage) => {
            const duration = durationMs(stage.startedAt, stage.completedAt);
            const artifacts = artifactsByStage.get(stage.id) ?? [];
            return (
              <li
                key={stage.id}
                className="flex flex-col gap-1 rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2 text-sm">
                  {stage.status === "completed" ? (
                    <Check
                      size={16}
                      className="text-emerald-600"
                      aria-hidden="true"
                    />
                  ) : stage.status === "failed" ? (
                    <CircleX
                      size={16}
                      className="text-destructive"
                      aria-hidden="true"
                    />
                  ) : (
                    <LoaderCircle
                      size={16}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  <span className="font-medium">
                    {STAGE_LABELS[stage.name] ?? stage.name}
                  </span>
                  {duration !== null ? (
                    <span className="text-xs text-muted-foreground">
                      {duration} ms
                    </span>
                  ) : null}
                </div>
                {stage.errorSummary ? (
                  <p className="text-xs text-destructive">
                    {stage.errorCode ? `${stage.errorCode}: ` : ""}
                    {stage.errorSummary}
                  </p>
                ) : null}
                {artifacts.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {artifacts.map((artifact) => (
                      <li key={artifact.id}>
                        <a
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs underline-offset-4 hover:underline"
                          href={`/api/admin/catalogue-imports/artifacts/${artifact.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {ARTIFACT_LABELS[artifact.kind] ?? artifact.kind}
                          <span className="text-muted-foreground">
                            {formatBytes(artifact.byteSize)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
