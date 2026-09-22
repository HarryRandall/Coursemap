import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";
import { badgeVariantForTone } from "@/lib/ui";
import type { SyncDetail } from "@/lib/coursemap/admin-operations";
import { adminCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import { DataTableShell } from "@/ui/common/data-table";
import { ArtefactViewer } from "./artefact-viewer";
import {
  formatBytes,
  formatCost,
  formatDuration,
  formatTimestamp,
  syncStatusLabel,
  syncStatusTone,
} from "./operations-format";
import { CATALOGUE_OPERATIONS_PATH } from "./operations-tabs";

const STAGE_LABELS: Record<string, string> = {
  source_fetch: "Source fetch",
  html_capture: "HTML capture",
  markdown_normalise: "Markdown normalise",
  model_input_prepare: "Model input",
  deterministic_extract: "Deterministic extraction",
  model_extract: "Model extraction",
  schema_validate: "Schema validation",
  domain_validate: "Domain validation",
  content_project: "Content projection",
  source_version_persist: "Source version",
};

function Facts({
  items,
}: {
  items: Array<{ label: string; value: string | null }>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm break-words">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** Everything one sync recorded, for a developer diagnosing or retrying it. */
export function SyncDetailView({ sync }: { sync: SyncDetail }) {
  const recordPath = adminCatalogueRecordPath(
    sync.kind,
    sync.academicYear,
    sync.code,
  );
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <Link
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
        href={CATALOGUE_OPERATIONS_PATH}
      >
        <ArrowLeft aria-hidden="true" size={14} />
        Back to syncs
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {sync.code}
            </h1>
            <Badge variant="outline">{sync.academicYear}</Badge>
            <Badge variant={badgeVariantForTone[syncStatusTone(sync.status)]}>
              {syncStatusLabel(sync.status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {sync.trigger === "manual" ? "Started by hand" : "Scheduled"} ·{" "}
            {formatTimestamp(sync.requestedAt)}
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-1 self-start text-sm underline-offset-4 hover:underline"
          href={recordPath}
        >
          Open the record <ExternalLink aria-hidden="true" size={12} />
        </Link>
      </header>

      {sync.errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>{sync.errorCode ?? "The sync failed"}</AlertTitle>
          <AlertDescription>{sync.errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Section title="Execution">
        <Facts
          items={[
            { label: "Attempts", value: String(sync.attemptCount) },
            { label: "Started", value: formatTimestamp(sync.startedAt) },
            { label: "Completed", value: formatTimestamp(sync.completedAt) },
            {
              label: "Duration",
              value: formatDuration(
                sync.startedAt && sync.completedAt
                  ? Date.parse(sync.completedAt) - Date.parse(sync.startedAt)
                  : null,
              ),
            },
            { label: "Worker", value: sync.workerId },
            {
              label: "Lease expires",
              value: formatTimestamp(sync.leaseExpiresAt),
            },
            { label: "Queue message", value: sync.queueMessageId },
            { label: "Dispatched", value: formatTimestamp(sync.dispatchedAt) },
            { label: "Changes found", value: String(sync.changeCount) },
          ]}
        />
      </Section>

      <Section title="Contracts">
        <Facts
          items={[
            { label: "Requested model", value: sync.requestedModel },
            { label: "Parser", value: sync.parserVersion },
            { label: "Prompt", value: sync.promptVersion },
            { label: "Schema", value: sync.schemaVersion },
          ]}
        />
      </Section>

      {sync.sourceDocument ? (
        <Section title="Source document">
          <Facts
            items={[
              { label: "URL", value: sync.sourceDocument.canonicalUrl },
              {
                label: "HTTP status",
                value:
                  sync.sourceDocument.httpStatus === null
                    ? null
                    : String(sync.sourceDocument.httpStatus),
              },
              {
                label: "Fetched",
                value: formatTimestamp(sync.sourceDocument.fetchedAt),
              },
              {
                label: "Size",
                value: formatBytes(sync.sourceDocument.byteSize),
              },
              { label: "Media type", value: sync.sourceDocument.mediaType },
              {
                label: "Content hash",
                value: sync.sourceDocument.contentSha256.slice(0, 16),
              },
            ]}
          />
        </Section>
      ) : null}

      <Section title="Stages">
        {sync.stages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This sync recorded no stages.
          </p>
        ) : (
          <DataTableShell>
            <Table className="min-w-[44rem]">
              <TableCaption className="sr-only">Sync stages</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sync.stages.map((stage) => (
                  <TableRow key={stage.id}>
                    <TableCell>
                      {STAGE_LABELS[stage.stageName] ?? stage.stageName}
                    </TableCell>
                    <TableCell>{stage.attemptNumber}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          stage.status === "failed"
                            ? "destructive-light"
                            : stage.status === "completed"
                              ? "success-light"
                              : "info-light"
                        }
                      >
                        {stage.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatTimestamp(stage.startedAt)}</TableCell>
                    <TableCell>{formatDuration(stage.durationMs)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {stage.errorSummary ?? stage.errorCode ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        )}
      </Section>

      {sync.extractions.length > 0 ? (
        <Section title="Extractions">
          <DataTableShell>
            <Table className="min-w-[52rem]">
              <TableCaption className="sr-only">Model extractions</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Validation</TableHead>
                  <TableHead>Tokens in</TableHead>
                  <TableHead>Tokens out</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sync.extractions.map((extraction) => (
                  <TableRow key={extraction.id}>
                    <TableCell>{extraction.extractionNumber}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {extraction.resolvedModel ?? extraction.requestedModel}
                      {extraction.reusedFromExtractionId ? (
                        <span className="ml-2 text-muted-foreground">
                          reused
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          extraction.validationStatus === "valid"
                            ? "success-light"
                            : extraction.validationStatus === "invalid"
                              ? "destructive-light"
                              : "outline"
                        }
                      >
                        {extraction.validationStatus}
                      </Badge>
                      {extraction.errorCount > 0 ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {extraction.errorCount} errors
                        </span>
                      ) : extraction.warningCount > 0 ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {extraction.warningCount} warnings
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {extraction.inputTokens}
                      {extraction.cachedInputTokens > 0
                        ? ` (${extraction.cachedInputTokens} cached)`
                        : ""}
                    </TableCell>
                    <TableCell>
                      {extraction.outputTokens}
                      {extraction.reasoningTokens > 0
                        ? ` (${extraction.reasoningTokens} reasoning)`
                        : ""}
                    </TableCell>
                    <TableCell>
                      {formatDuration(extraction.latencyMs)}
                    </TableCell>
                    <TableCell>{formatCost(extraction.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        </Section>
      ) : null}

      <Section title="Artefacts">
        <div className="flex min-h-[28rem] flex-col">
          <ArtefactViewer
            artifacts={sync.artefacts.map((artefact) => ({
              id: artefact.id,
              kind: artefact.kind,
              attemptNumber: artefact.attemptNumber,
              mediaType: artefact.mediaType,
            }))}
            endpoint="/api/admin/catalogue-syncs/artifacts"
          />
        </div>
      </Section>
    </div>
  );
}
