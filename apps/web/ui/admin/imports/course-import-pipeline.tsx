import { ImportErrorDetails } from "./import-error-details";
import { ImportEmptyState } from "./import-empty-state";
import type { ReactNode } from "react";
import { badgeVariantForTone } from "@/lib/ui";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@coursemap/ui/primitives/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";
import ReuiLink from "next/link";
import { FileCode2 } from "lucide-react";

import { DataTableShell } from "@/ui/common/data-table";
import type { CourseImportTargetDetail } from "@/lib/coursemap/admin-course-imports";
import type { Tone } from "@/lib/ui";

function readable(value: string) {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function statusTone(status: string): Tone {
  if (status === "failed" || status === "cancelled" || status === "rejected") {
    return "danger";
  }
  if (status === "queued" || status === "processing" || status === "running") {
    return "info";
  }
  if (status === "ready_for_review" || status === "pending") return "warning";
  if (status === "accepted" || status === "succeeded" || status === "valid") {
    return "success";
  }
  return "neutral";
}

function duration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return "—";
  const milliseconds =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  if (milliseconds < 1_000) return `${milliseconds}ms`;
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

export function CourseImportPipeline({
  extractions,
  contained = true,
  diagnostics,
  reviewHref,
  stages,
}: {
  contained?: boolean;
  extractions: CourseImportTargetDetail["extractions"];
  reviewHref?: string;
  diagnostics?: ReactNode;
  stages: CourseImportTargetDetail["stages"];
}) {
  return (
    <div className={contained ? "workspace-stack" : "space-y-4"}>
      {reviewHref ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Latest import pipeline
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Processing stages and model usage for the import behind this
              snapshot.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <ReuiLink href={reviewHref}>
              <FileCode2 aria-hidden="true" size={15} />
              Full import review
            </ReuiLink>
          </Button>
        </div>
      ) : null}

      <div
        className={contained ? "workspace-scroll space-y-4" : "space-y-4"}
        role="region"
        aria-label="Import pipeline"
        tabIndex={0}
      >
        <div
          className="min-w-0 overflow-x-auto"
          role="region"
          aria-label="Pipeline stages"
          data-scroll-kind="table"
          tabIndex={0}
        >
          {stages.length ? (
            <DataTableShell>
              <Table className="min-w-[720px]">
                <TableCaption className="sr-only">
                  Import pipeline stages
                </TableCaption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16">Step</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stages.map((stage) => (
                    <TableRow key={stage.id}>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {stage.position}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-foreground/90">
                        {readable(stage.stage_name)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            badgeVariantForTone[statusTone(stage.status)]
                          }
                        >
                          {readable(stage.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {stage.attempt_count}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {duration(stage.started_at, stage.completed_at)}
                      </TableCell>
                      <TableCell className="max-w-72 text-xs">
                        {stage.error_summary ? (
                          <ImportErrorDetails message={stage.error_summary} />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableShell>
          ) : (
            <ImportEmptyState kind="pipeline" />
          )}
        </div>
        <div
          className="min-w-0 space-y-4"
          role="region"
          aria-label="Extraction attempts and issues"
          tabIndex={0}
        >
          {extractions.length === 0 ? <ImportEmptyState kind="model" /> : null}
          {extractions.map((extraction) => (
            <Card key={extraction.id}>
              <CardHeader>
                <CardTitle>
                  <h2>
                    {extraction.resolved_model ?? extraction.requested_model}
                  </h2>
                </CardTitle>
                <CardDescription>{`Extraction attempt ${extraction.extraction_number}`}</CardDescription>
                <CardAction>
                  <Badge
                    variant={
                      badgeVariantForTone[
                        statusTone(extraction.validation_status)
                      ]
                    }
                  >
                    {readable(extraction.validation_status)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 xl:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Input</dt>
                    <dd className="mt-1 tabular-nums">
                      {extraction.input_tokens.toLocaleString("en-AU")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cached input</dt>
                    <dd className="mt-1 tabular-nums">
                      {extraction.cached_input_tokens.toLocaleString("en-AU")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Output</dt>
                    <dd className="mt-1 tabular-nums">
                      {extraction.output_tokens.toLocaleString("en-AU")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Reasoning</dt>
                    <dd className="mt-1 tabular-nums">
                      {extraction.reasoning_tokens.toLocaleString("en-AU")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cost</dt>
                    <dd className="mt-1 tabular-nums">
                      ${extraction.cost_usd.toFixed(6)} USD ·{" "}
                      {extraction.cost_source}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Latency</dt>
                    <dd className="mt-1 tabular-nums">
                      {extraction.latency_ms === null
                        ? "—"
                        : `${extraction.latency_ms}ms`}
                    </dd>
                  </div>
                </dl>
                {extraction.error_summary ? (
                  <details className="mt-3 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      Validation details
                    </summary>
                    <p className="mt-2">{extraction.error_summary}</p>
                  </details>
                ) : null}
                {extraction.reused_from_extraction_id ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Reused an identical earlier extraction, so no additional
                    model cost was incurred.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {diagnostics}
        </div>
      </div>
    </div>
  );
}
