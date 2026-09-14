import { ImportEmptyState } from "./import-empty-state";
import type { ReactNode } from "react";
import { badgeVariantForTone } from "@/lib/ui";
import { Badge } from "@coursemap/ui/components/badge";
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

import { DataTableShell } from "@/ui/common/data-table";
import type { AcademicStructureImportTargetDetail } from "@/lib/coursemap/admin-academic-structure-imports";
import type { Tone } from "@/lib/ui";

function readable(value: string) {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function statusTone(status: string): Tone {
  if (status === "failed" || status === "invalid") return "danger";
  if (status === "running" || status === "pending") return "info";
  if (status === "succeeded" || status === "valid") return "success";
  return "neutral";
}

function duration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return "Not recorded";
  const milliseconds =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return "Not recorded";
  }
  if (milliseconds < 1_000) return `${milliseconds}ms`;
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

function tokens(value: number | null) {
  return value === null ? "Not recorded" : value.toLocaleString("en-AU");
}

function cost(value: number | null) {
  if (value === null) return "Not recorded";
  return `${new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: 6,
  }).format(value)} USD`;
}

export function AcademicStructureImportPipeline({
  extractions,
  contained = true,
  diagnostics,
  stages,
}: {
  contained?: boolean;
  extractions: AcademicStructureImportTargetDetail["extractions"];
  diagnostics?: ReactNode;
  stages: AcademicStructureImportTargetDetail["stages"];
}) {
  return (
    <div className={contained ? "workspace-stack" : "min-w-0 space-y-4"}>
      <div
        className={
          contained ? "workspace-scroll space-y-4" : "min-w-0 space-y-4"
        }
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
              <Table className="min-w-[760px]">
                <TableCaption className="sr-only">
                  Academic structure import stages
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
                        {stage.position + 1}
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
                      <TableCell
                        className={`max-w-72 truncate text-xs ${stage.error_summary ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"}`}
                      >
                        {stage.error_summary ?? "None"}
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
          {extractions.length === 0 ? (
            <ImportEmptyState kind="model" />
          ) : (
            extractions.map((extraction) => (
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
                      <dt className="text-muted-foreground">Requested model</dt>
                      <dd className="mt-1 font-mono break-all text-foreground/90">
                        {extraction.requested_model}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Input</dt>
                      <dd className="mt-1 tabular-nums">
                        {tokens(extraction.input_tokens)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Cached input</dt>
                      <dd className="mt-1 tabular-nums">
                        {tokens(extraction.cached_input_tokens)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Output</dt>
                      <dd className="mt-1 tabular-nums">
                        {tokens(extraction.output_tokens)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Reasoning</dt>
                      <dd className="mt-1 tabular-nums">
                        {tokens(extraction.reasoning_tokens)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Cost</dt>
                      <dd className="mt-1 tabular-nums">
                        {cost(extraction.cost_usd)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Latency</dt>
                      <dd className="mt-1 tabular-nums">
                        {extraction.latency_milliseconds === null
                          ? "Not recorded"
                          : `${extraction.latency_milliseconds}ms`}
                      </dd>
                    </div>
                  </dl>
                  {extraction.validation_summary ? (
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {extraction.validation_summary}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
          {diagnostics}
        </div>
      </div>
    </div>
  );
}
