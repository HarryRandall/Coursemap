"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Checkbox } from "@coursemap/ui/primitives/checkbox";
import { catalogueWorkspacePath } from "@/lib/coursemap/catalogue-workspace-routes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { ExtractionIssue } from "@/ui/admin/imports/extraction-issue";
import { CatalogueValue } from "@/ui/admin/imports/catalogue-value";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import {
  inspectCatalogueProposal,
  applyCatalogueProposal,
} from "@/lib/coursemap/catalogue-proposal-actions";
import { catalogueFieldLabel } from "@/lib/coursemap/catalogue-proposal-comparison";
import {
  acceptCourseImportTarget,
  rejectCourseImportTarget,
} from "@/lib/coursemap/course-import-review-actions";
import {
  acceptAcademicStructureImportTarget,
  rejectAcademicStructureImportTarget,
} from "@/lib/coursemap/academic-structure-import-review-actions";
import type { PendingCatalogueImport } from "@/lib/coursemap/pending-catalogue-import";
import type { AcademicStructureKind } from "@/lib/structure-import/contract";

type Comparison = Awaited<ReturnType<typeof inspectCatalogueProposal>>;

function ImportProposal({
  proposal,
  currentDraftSnapshotId,
  structureKind,
  onResolved,
}: {
  proposal: PendingCatalogueImport;
  currentDraftSnapshotId: number | null;
  structureKind?: AcademicStructureKind;
  onResolved: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const installed =
    currentDraftSnapshotId === proposal.candidateSnapshotId ||
    proposal.isCurrentDraftSource === true;
  const href = catalogueWorkspacePath(
    pathname,
    "history",
    `import=${proposal.targetId}`,
  );

  async function inspect() {
    setExpanded(!expanded);
    if (comparison || loading || expanded) return;
    setLoading(true);
    setError(null);
    try {
      setComparison(
        await inspectCatalogueProposal(proposal.targetId, structureKind),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The imported changes could not be loaded. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function decide(accept: boolean) {
    if (accept && comparison) {
      try {
        await applyCatalogueProposal(
          proposal.targetId,
          comparison.currentSnapshotId,
          selected,
          structureKind,
        );
        onResolved();
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The changes could not be applied.",
        );
      }
      return;
    }
    const result = structureKind
      ? await (
          accept
            ? acceptAcademicStructureImportTarget
            : rejectAcademicStructureImportTarget
        )({ runId: proposal.runId, targetId: proposal.targetId })
      : await (accept ? acceptCourseImportTarget : rejectCourseImportTarget)({
          runId: proposal.runId,
          targetId: proposal.targetId,
          expectedBaselineDraftSnapshotId: proposal.baselineDraftSnapshotId,
          expectedCurrentDraftSnapshotId: currentDraftSnapshotId,
        });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onResolved();
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Imported differences</h2>
          <Badge variant="outline">
            {new Date(proposal.createdAt).toLocaleDateString("en-AU", {
              timeZone: "Australia/Sydney",
            })}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href={href}>View import</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void inspect()}
            aria-expanded={expanded}
          >
            {expanded ? "Hide changes" : "Review changes"}
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {expanded ? (
        <div className="space-y-4 border-t border-border p-4">
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading imported changes…
            </p>
          ) : null}
          {comparison ? (
            <>
              {comparison.issues.length ? (
                <div className="space-y-3">
                  {comparison.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-lg border border-amber-500/30 p-3"
                    >
                      <ExtractionIssue
                        message={issue.message}
                        sourceText={issue.sourceText}
                        values={issue.values}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="space-y-3">
                {comparison.fields.map((field) => (
                  <details
                    key={field.key}
                    className="rounded-lg border border-border"
                  >
                    <summary className="cursor-pointer px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                      <span
                        className="mr-3 inline-flex"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={`Apply ${catalogueFieldLabel(field.key)}`}
                          checked={selected.includes(field.key)}
                          onCheckedChange={(value) =>
                            setSelected((keys) =>
                              value === true
                                ? [...keys, field.key]
                                : keys.filter((key) => key !== field.key),
                            )
                          }
                        />
                      </span>
                      {catalogueFieldLabel(field.key)}
                    </summary>
                    <div
                      className={`grid gap-4 px-3 pb-3 text-sm ${comparison.first ? "" : "md:grid-cols-2"}`}
                    >
                      {!comparison.first ? (
                        <div>
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Current
                          </p>
                          <CatalogueValue value={field.before} />
                        </div>
                      ) : null}
                      <div>
                        <p className="mb-2 text-xs font-medium text-primary">
                          Imported
                        </p>
                        <CatalogueValue value={field.after} />
                      </div>
                    </div>
                  </details>
                ))}
                {!comparison.first && comparison.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No changes found.
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                {!installed ? (
                  <ConfirmDialog
                    title="Reject these imported changes?"
                    description="The current draft is retained."
                    confirmLabel="Reject changes"
                    destructive
                    onConfirm={() => decide(false)}
                    trigger={
                      <Button variant="outline" size="sm">
                        Reject changes
                      </Button>
                    }
                  />
                ) : null}
                <ConfirmDialog
                  title={
                    installed
                      ? "Complete the review?"
                      : "Apply the selected changes?"
                  }
                  description={
                    installed
                      ? "Confirm that you have checked the imported content and extraction issues."
                      : "Only the selected changes will be applied. Affected sections will need approval before publishing."
                  }
                  confirmLabel={
                    installed ? "Complete review" : "Apply selected changes"
                  }
                  onConfirm={() => decide(true)}
                  trigger={
                    <Button size="sm" disabled={!selected.length}>
                      {installed ? "Complete review" : "Apply selected changes"}
                    </Button>
                  }
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function PendingImportProposals({
  pendingImports,
  currentDraftSnapshotId,
  structureKind,
}: {
  pendingImports: PendingCatalogueImport[];
  currentDraftSnapshotId: number | null;
  structureKind?: AcademicStructureKind;
}) {
  const [resolved, setResolved] = useState<string[]>([]);
  const visible = pendingImports.filter(
    (proposal) =>
      !resolved.includes(proposal.targetId) &&
      proposal.candidateSnapshotId !== currentDraftSnapshotId &&
      !proposal.isCurrentDraftSource,
  );
  if (!visible.length) return null;
  return (
    <div className="space-y-3">
      {visible.map((proposal) => (
        <ImportProposal
          key={proposal.targetId}
          proposal={proposal}
          currentDraftSnapshotId={currentDraftSnapshotId}
          structureKind={structureKind}
          onResolved={() =>
            setResolved((values) => [...values, proposal.targetId])
          }
        />
      ))}
    </div>
  );
}
