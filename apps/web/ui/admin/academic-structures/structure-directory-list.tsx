"use client";

import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { StopStructureImport } from "@/ui/admin/imports/stop-structure-import";
import { badgeVariantForTone } from "@/lib/ui";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { Checkbox } from "@coursemap/ui/primitives/checkbox";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@coursemap/ui/primitives/tooltip";
import ReuiLink from "next/link";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { History, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { readImportStream } from "@/ui/admin/imports/import-stream";
import { CourseImportAutoRefresh } from "@/ui/admin/imports/course-import-auto-refresh";
import { AppShell } from "@/ui/shell";

import { DirectorySelectionBar } from "@/ui/admin/common/directory-selection-bar";
import {
  DataTableShell,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/admin/catalogue-table/catalogue-table";
import { CatalogueIdentity } from "@/ui/admin/catalogue-table/catalogue-table";
import { CatalogueRowActions } from "@/ui/admin/catalogue-table/catalogue-row-actions";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { FilterBar } from "@/ui/common/filter-bar";
import { Pagination } from "@/ui/common/pagination";
import { SortMenu, type SortOption } from "@/ui/common/sort-menu";

import { YearPicker, type YearSelection } from "@/ui/common/year-picker";
import type {
  AcademicStructureDirectoryPage,
  AcademicStructureDirectoryRecord,
  AcademicStructureDirectorySort,
} from "@/lib/coursemap/admin-academic-structures";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import {
  adminAcademicStructureCollectionPath,
  adminAcademicStructureDetailPath,
  adminAcademicStructureImportsPath,
} from "@/lib/coursemap/academic-structure-routes";
import type { AcademicStructureKind } from "@/lib/structure-import/contract";
import type { Tone } from "@/lib/ui";

const KIND_DETAILS = {
  programme: {
    label: "Programmes",
    singular: "programme",
    plural: "programmes",
  },
  major: { label: "Majors", singular: "major", plural: "majors" },
  minor: { label: "Minors", singular: "minor", plural: "minors" },
  specialisation: {
    label: "Specialisations",
    singular: "specialisation",
    plural: "specialisations",
  },
} as const satisfies Record<
  AcademicStructureKind,
  { label: string; singular: string; plural: string }
>;

const SORT_OPTIONS: SortOption<AcademicStructureDirectorySort>[] = [
  { label: "Code, A to Z", value: "code-asc" },
  { descending: true, label: "Code, Z to A", value: "code-desc" },
  { label: "Name, A to Z", value: "title-asc" },
  { descending: true, label: "Name, Z to A", value: "title-desc" },
  { label: "Workflow status", value: "status" },
];

function statusTone(
  status: AcademicStructureDirectoryRecord["importStatus"],
): Tone {
  if (status === "failed") return "danger";
  if (status === "queued" || status === "processing") return "info";
  if (status === "needs-review") return "warning";
  if (status === "draft" || status === "draft-changes") return "brand";
  if (status === "published") return "success";
  return "neutral";
}

function statusLabel(status: AcademicStructureDirectoryRecord["importStatus"]) {
  if (status === "needs-review") return "Needs review";
  if (status === "directory") return "Not imported";
  if (status === "draft-changes") return "Draft changes";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type DirectoryRefreshResult = {
  status: "succeeded" | "failed";
  counts: { checked: number; failed: number };
  warningCount: number;
  errorCount: number;
  receivedItemCount: number;
  uniqueItemCount: number;
};

function directoryRefreshResult(value: unknown): DirectoryRefreshResult | null {
  if (typeof value !== "object" || value === null) return null;
  const result = value as Record<string, unknown>;
  const counts = result.counts;
  if (
    (result.status !== "succeeded" && result.status !== "failed") ||
    typeof counts !== "object" ||
    counts === null
  ) {
    return null;
  }
  const countValues = counts as Record<string, unknown>;
  if (
    typeof countValues.checked !== "number" ||
    typeof countValues.failed !== "number" ||
    typeof result.warningCount !== "number" ||
    typeof result.errorCount !== "number" ||
    typeof result.receivedItemCount !== "number" ||
    typeof result.uniqueItemCount !== "number"
  ) {
    return null;
  }
  return {
    status: result.status,
    counts: {
      checked: countValues.checked,
      failed: countValues.failed,
    },
    warningCount: result.warningCount,
    errorCount: result.errorCount,
    receivedItemCount: result.receivedItemCount,
    uniqueItemCount: result.uniqueItemCount,
  };
}

function shouldOpenLatestImport(record: AcademicStructureDirectoryRecord) {
  const latest = record.latestImport;
  if (!latest) return false;
  return (
    latest.reviewStatus === "pending" ||
    latest.reviewStatus === "needs_review" ||
    latest.reviewStatus === "unchanged" ||
    ["queued", "running", "failed", "cancelled"].includes(
      latest.processingStatus,
    )
  );
}

function WorkflowStatus({
  record,
}: {
  record: AcademicStructureDirectoryRecord;
}) {
  return (
    <Badge variant={badgeVariantForTone[statusTone(record.importStatus)]}>
      {statusLabel(record.importStatus)}
    </Badge>
  );
}

export function StructureDirectoryList({
  canImport,
  data,
  importModel,
  modelOptions,
  queueEnabled,
  searchParams,
}: {
  canImport: boolean;
  data: AcademicStructureDirectoryPage;
  importModel: string;
  modelOptions: string[];
  queueEnabled: boolean;
  searchParams: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  // Bumping this replays the selection bar's "already full" rebuff, which
  // keeps the refusal on the control instead of in a toast.
  const [limitSignal, setLimitSignal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const labels = KIND_DETAILS[data.kind];
  const collectionPath = adminAcademicStructureCollectionPath(data.kind);
  const importsPath = adminAcademicStructureImportsPath(data.kind);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const eligibleRecords = data.records.filter((record) => record.isAvailable);
  const currentSort =
    (searchParams.sort as AcademicStructureDirectorySort | undefined) ??
    "code-asc";
  const allPageSelected =
    eligibleRecords.length > 0 &&
    eligibleRecords.every((record) => selectedSet.has(record.code));
  const somePageSelected = eligibleRecords.some((record) =>
    selectedSet.has(record.code),
  );

  function chooseYear(year: YearSelection) {
    router.replace(`${collectionPath}?year=${year}`);
  }

  function chooseSort(value: AcademicStructureDirectorySort) {
    const params = new URLSearchParams();
    for (const [key, parameter] of Object.entries(searchParams)) {
      if (parameter) params.set(key, parameter);
    }
    if (value === "code-asc") params.delete("sort");
    else params.set("sort", value);
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${collectionPath}?${query}` : collectionPath, {
      scroll: false,
    });
  }

  function toggleStructure(code: string, checked: boolean) {
    setSelected((current) => {
      if (!checked) return current.filter((value) => value !== code);
      if (current.includes(code)) return current;
      if (current.length >= 10) {
        setLimitSignal((signal) => signal + 1);
        return current;
      }
      return [...current, code];
    });
  }

  function togglePage(checked: boolean) {
    const pageCodes = new Set(eligibleRecords.map((record) => record.code));
    if (!checked) {
      setSelected((current) => current.filter((code) => !pageCodes.has(code)));
      return;
    }
    setSelected((current) =>
      [
        ...new Set([
          ...current,
          ...eligibleRecords.map((record) => record.code),
        ]),
      ].slice(0, 10),
    );
    if (eligibleRecords.length + selected.length > 10) {
      setLimitSignal((signal) => signal + 1);
    }
  }

  async function refreshDirectory() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/academic-structure-directory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          academicYear: data.year.year,
          structureKind: data.kind,
        }),
      });
      let result: DirectoryRefreshResult | null = null;
      await readImportStream(response, (event) => {
        if (event.type === "complete") {
          result = directoryRefreshResult(event.result);
        }
      });
      router.refresh();
      if (!result) {
        throw new Error(
          `The ${labels.singular} directory returned no completion result.`,
        );
      }
      const completed: DirectoryRefreshResult = result;
      if (completed.status === "failed") {
        const failureCount = completed.errorCount || completed.counts.failed;
        if (completed.counts.checked === 0) {
          toast.warning(
            `ANU returned no usable ${labels.singular} directory data.`,
            {
              description: `Existing ${data.year.year} entries were preserved.`,
            },
          );
        } else {
          toast.error(
            `The ${data.year.year} ${labels.singular} directory found ${failureCount} error${failureCount === 1 ? "" : "s"}.`,
            {
              description:
                "Usable rows were saved and missing existing entries were preserved.",
            },
          );
        }
      } else if (completed.warningCount > 0) {
        toast.warning(
          `${data.year.year} ${labels.singular} directory refreshed with ${completed.warningCount} warning${completed.warningCount === 1 ? "" : "s"}.`,
          {
            description: `${completed.receivedItemCount.toLocaleString("en-AU")} rows produced ${completed.uniqueItemCount.toLocaleString("en-AU")} unique entries.`,
          },
        );
      } else {
        toast.success(
          `${data.year.year} ${labels.singular} directory refreshed with ${completed.uniqueItemCount.toLocaleString("en-AU")} entries.`,
          { description: "No detailed records were imported." },
        );
      }
    } catch (error) {
      router.refresh();
      const message =
        error instanceof Error
          ? error.message
          : `The ${labels.singular} directory could not be refreshed.`;
      const unavailable =
        /(?:HTTP\s+(?:404|410)|no .*directory|no .*data)/iu.test(message);
      if (unavailable) {
        toast.warning(
          `ANU has no ${labels.singular} directory data for ${data.year.year}.`,
          { description: "Existing entries were preserved." },
        );
      } else {
        toast.error(
          `The ${labels.singular} directory could not be refreshed.`,
          {
            description: message,
          },
        );
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function startImport(requestedModel: string) {
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/academic-structure-imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          academicYear: data.year.year,
          structureKind: data.kind,
          structureCodes: selected,
          requestedModel,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        runId?: string;
        runNumber?: number;
      } | null;
      if (!response.ok) {
        if (payload?.runId) {
          router.push(importsPath);
          return;
        }
        throw new Error(
          payload?.error ??
            `The ${labels.singular} import could not be queued.`,
        );
      }
      if (!payload?.runId || typeof payload.runNumber !== "number") {
        throw new Error("The import run number was not returned.");
      }
      router.push(importsPath);
    } catch (error) {
      toast.error(`The ${labels.singular} import could not be queued.`, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const importDisabledReason = !canImport
    ? "Academic structure import permission is required."
    : !queueEnabled
      ? "Background academic structure imports are not enabled in this deployment."
      : data.activeRun
        ? `Wait for ${KIND_DETAILS[data.activeRun.structureKind].singular} import run ${data.activeRun.runNumber} to finish before starting another.`
        : !data.year.importEnabled
          ? "This academic year is not enabled for imports."
          : data.year.sourceAvailability === "unavailable"
            ? `ANU has no ${labels.singular} directory data for this academic year.`
            : selected.length === 0
              ? `Select at least one ${labels.singular}.`
              : !importModel
                ? "No import model is configured in the admin dashboard."
                : null;

  return (
    <AppShell admin fill>
      <CourseImportAutoRefresh active={Boolean(data.activeRun)} />
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-4">
        <h1 className="sr-only">{labels.label}</h1>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="default" variant="outline">
              <ReuiLink href={importsPath}>
                <History aria-hidden="true" size={15} />
                Imports
              </ReuiLink>
            </Button>
            {data.year.sourceAvailability === "unavailable" ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"
                title={
                  data.year.availabilityNote ??
                  `ANU lists no ${labels.singular} directory for ${data.year.year}.`
                }
              >
                <TriangleAlert aria-hidden="true" size={14} />
                No ANU data
              </span>
            ) : null}
            {data.activeRun?.structureKind === data.kind ? (
              <Link
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                href={importsPath}
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                  size={13}
                />
                Run {data.activeRun.runNumber} {data.activeRun.status} ·{" "}
                {data.activeRun.processedCount}/{data.activeRun.targetCount}
              </Link>
            ) : null}
          </div>
          {data.activeRun ? (
            <StopStructureImport runId={data.activeRun.id} />
          ) : null}
          <YearPicker
            allowAll
            onChange={chooseYear}
            value={data.allYears ? "all" : data.year.year}
            years={data.years.map((year) => year.year)}
          />
        </div>

        <ConfirmDialog
          confirmLabel="Refresh directory"
          description={`Pulls the current list of ${labels.singular} codes and titles from ANU for ${data.year.year}. Nothing is imported and no drafts or published content change.`}
          onConfirm={refreshDirectory}
          onOpenChange={setRefreshDialogOpen}
          open={refreshDialogOpen}
          title={`Refresh ${data.year.year} ${labels.singular} directory?`}
        />

        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <FilterBar
              filters={[
                {
                  key: "status",
                  label: "Status",
                  allLabel: `All ${labels.plural}`,
                  negatable: true,
                  options: [
                    { label: "Not imported", value: "directory" },
                    { label: "Queued", value: "queued" },
                    { label: "Processing", value: "processing" },
                    { label: "Needs review", value: "needs-review" },
                    { label: "Draft", value: "draft" },
                    { label: "Draft changes", value: "draft-changes" },
                    { label: "Published", value: "published" },
                    { label: "Unchanged", value: "unchanged" },
                    { label: "Failed", value: "failed" },
                  ],
                },
                {
                  key: "availability",
                  label: "Availability",
                  allLabel: "All directory entries",
                  negatable: true,
                  options: [
                    { label: "Available at ANU", value: "available" },
                    { label: "No longer listed", value: "unavailable" },
                  ],
                },
              ]}
              searchPlaceholder={`Search ${labels.plural} by code or title`}
            />
          </div>
          <SortMenu
            defaultValue="code-asc"
            onChange={chooseSort}
            options={SORT_OPTIONS}
            value={currentSort}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex"
                tabIndex={
                  !canImport || refreshing || data.allYears ? 0 : undefined
                }
              >
                <Button
                  aria-label={`Refresh the ${labels.singular} directory`}
                  className="size-10 shrink-0"
                  disabled={!canImport || refreshing || data.allYears}
                  onClick={() => setRefreshDialogOpen(true)}
                  size="icon"
                  variant="outline"
                  type="button"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={
                      refreshing
                        ? "animate-spin motion-reduce:animate-none"
                        : ""
                    }
                    size={16}
                  />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {data.allYears
                ? "Choose a single year to refresh its directory"
                : refreshing
                  ? "Refreshing..."
                  : `Refresh the ${labels.singular} directory`}
            </TooltipContent>
          </Tooltip>
        </div>

        <DataTableShell
          selectable={!data.allYears}
          footer={
            <Pagination
              alwaysShowControls
              itemName={labels.plural}
              page={data.page}
              pageSize={data.pageSize}
              pathname={collectionPath}
              searchParams={searchParams}
              total={data.total}
            />
          }
        >
          {data.records.length === 0 ? (
            <CatalogueEmpty
              filtered={Boolean(
                searchParams.q ||
                searchParams.status ||
                searchParams.availability,
              )}
              title={
                data.allYears
                  ? `No ${labels.plural} yet`
                  : `No ${labels.plural} for ${data.year.year}`
              }
              description="Run a directory sync to load codes and titles from ANU."
              clearHref={`${collectionPath}?year=${data.allYears ? "all" : data.year.year}`}
              onSync={
                !data.allYears && canImport && !refreshing
                  ? () => setRefreshDialogOpen(true)
                  : undefined
              }
            />
          ) : (
            <Table>
              <TableCaption className="sr-only">
                {labels.label} directory and import status
              </TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {data.allYears ? null : (
                    <TableHead className="w-12">
                      <Checkbox
                        aria-label={`Select available ${labels.plural} on this page`}
                        checked={
                          allPageSelected
                            ? true
                            : somePageSelected
                              ? "indeterminate"
                              : false
                        }
                        disabled={eligibleRecords.length === 0}
                        onCheckedChange={(checked) =>
                          togglePage(checked === true)
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead>
                    {labels.singular.charAt(0).toUpperCase() +
                      labels.singular.slice(1)}
                  </TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.records.map((record) => (
                  <LinkedTableRow
                    className={
                      selectedSet.has(record.code) ? "bg-primary/5" : undefined
                    }
                    key={record.id}
                  >
                    {data.allYears ? null : (
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${record.code}`}
                          checked={selectedSet.has(record.code)}
                          disabled={!record.isAvailable}
                          onCheckedChange={(checked) =>
                            toggleStructure(record.code, checked === true)
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <CatalogueIdentity
                        code={record.code}
                        title={record.title}
                        href={
                          record.structurePublicId
                            ? adminAcademicStructureDetailPath({
                                kind: record.kind,
                                publicId: record.structurePublicId,
                              })
                            : undefined
                        }
                        kind={record.kind}
                        unavailable={!record.isAvailable}
                      />
                    </TableCell>
                    <TableCell>{record.year}</TableCell>
                    <TableCell>
                      <WorkflowStatus record={record} />
                    </TableCell>
                    <TableCell>{record.units ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      <CatalogueRowActions
                        code={record.code}
                        {...(canImport &&
                        !data.allYears &&
                        queueEnabled &&
                        !data.activeRun &&
                        data.year.importEnabled &&
                        data.year.sourceAvailability !== "unavailable" &&
                        record.isAvailable
                          ? {
                              onSelectForImport: () =>
                                toggleStructure(record.code, true),
                            }
                          : {})}
                        links={[
                          ...(record.structurePublicId && record.structureYearId
                            ? [
                                {
                                  label:
                                    record.draftSnapshotId !== null
                                      ? "Preview draft"
                                      : "Open details",
                                  href: adminAcademicStructureDetailPath({
                                    kind: record.kind,
                                    publicId: record.structurePublicId,
                                  }),
                                },
                              ]
                            : []),
                          ...(shouldOpenLatestImport(record) &&
                          record.latestImport
                            ? [
                                {
                                  label: "Review latest import",
                                  href: `${adminAcademicStructureDetailPath({ kind: data.kind, publicId: record.structurePublicId! })}/history?import=${record.latestImport.targetId}`,
                                },
                              ]
                            : []),
                          {
                            label: "View ANU source",
                            href: record.sourceUrl,
                            icon: "source",
                          },
                          {
                            label: "Import history",
                            href: `${importsPath}?q=${encodeURIComponent(record.code)}`,
                            icon: "history",
                          },
                        ]}
                      />
                    </TableCell>
                  </LinkedTableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataTableShell>

        <DirectorySelectionBar
          canManageModel={canImport}
          disabledReason={importDisabledReason}
          importModel={importModel}
          limitSignal={limitSignal}
          modelOptions={modelOptions}
          onClear={() => setSelected([])}
          onImport={(model) => void startImport(model)}
          selected={selected.length}
          submitting={submitting}
        />
      </div>
    </AppShell>
  );
}
