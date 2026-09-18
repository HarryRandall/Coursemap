"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { Checkbox } from "@coursemap/ui/primitives/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import { History, LoaderCircle, RefreshCw, Upload, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  CATALOGUE_KIND_LABELS,
  type CatalogueDirectoryPage,
  type CatalogueDirectoryRecord,
  type DirectoryFilter,
} from "@/lib/coursemap/catalogue-kinds";
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
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { FilterBar } from "@/ui/common/filter-bar";
import { Pagination } from "@/ui/common/pagination";
import { YearPicker } from "@/ui/common/year-picker";
import { readImportStream } from "./import-stream";
import { WORKFLOW_LABELS, WorkflowBadge } from "./workflow-badge";

const MAX_SELECTION = 10;

const FILTER_OPTIONS = (
  Object.entries(WORKFLOW_LABELS) as Array<
    [DirectoryFilter, (typeof WORKFLOW_LABELS)[keyof typeof WORKFLOW_LABELS]]
  >
).map(([value, meta]) => ({ value, label: meta.label }));

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function summaryLine(record: CatalogueDirectoryRecord) {
  const parts: string[] = [];
  const summary = record.summary;
  if (typeof summary.career === "string" && summary.career)
    parts.push(summary.career);
  if (typeof summary.units === "number") parts.push(`${summary.units} units`);
  if (typeof summary.durationYears === "number") {
    parts.push(
      `${summary.durationYears} year${summary.durationYears === 1 ? "" : "s"}`,
    );
  }
  if (typeof summary.session === "string" && summary.session)
    parts.push(summary.session);
  return parts.join(" · ");
}

/**
 * The directory for one catalogue kind: the ANU listing for a year with each
 * record's workflow state, selection for a new import run and the refresh
 * action. The same component serves every kind.
 */
export function CatalogueDirectory({
  page,
  basePath,
  importsEnabled,
}: {
  page: CatalogueDirectoryPage;
  basePath: string;
  importsEnabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const labels = CATALOGUE_KIND_LABELS[page.kind];
  const [selected, setSelected] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [, startTransition] = useTransition();

  const query = searchParams.get("q") ?? "";
  const filter = (searchParams.get("status") ?? "all") as DirectoryFilter;

  const navigate = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === "all") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in updates)) next.delete("page");
    startTransition(() => {
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
    });
  };

  const selectable = useMemo(
    () =>
      page.records.filter(
        (record) =>
          record.workflow !== "queued" && record.workflow !== "running",
      ),
    [page.records],
  );
  const allSelected =
    selectable.length > 0 &&
    selectable
      .slice(0, MAX_SELECTION)
      .every((record) => selected.includes(record.code));

  function toggle(code: string) {
    setSelected((current) => {
      if (current.includes(code))
        return current.filter((value) => value !== code);
      if (current.length >= MAX_SELECTION) {
        toast.info(`Select up to ${MAX_SELECTION} records per run.`);
        return current;
      }
      return [...current, code];
    });
  }

  function toggleAll() {
    setSelected(
      allSelected
        ? []
        : selectable.slice(0, MAX_SELECTION).map((record) => record.code),
    );
  }

  async function refreshDirectory() {
    setRefreshing(true);
    setRefreshMessage("Contacting the ANU site…");
    try {
      const response = await fetch("/api/admin/catalogue-directory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: page.kind,
          academicYear: page.academicYear,
        }),
      });
      await readImportStream(response, (event) => {
        if (event.type === "progress" && typeof event.message === "string") {
          setRefreshMessage(event.message);
        }
        if (event.type === "complete") {
          const result = event.result as {
            entryCount?: number;
            added?: number;
          };
          toast.success(
            `Directory refreshed: ${result.entryCount ?? 0} ${labels.plural.toLowerCase()}, ${result.added ?? 0} new.`,
          );
        }
      });
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The refresh failed.",
      );
    } finally {
      setRefreshing(false);
      setRefreshMessage(null);
    }
  }

  async function startImport() {
    if (selected.length === 0) return;
    setStarting(true);
    try {
      const response = await fetch("/api/admin/catalogue-imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: page.kind,
          academicYear: page.academicYear,
          codes: selected,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        runId?: string;
        mode?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "The import could not start.");
      toast.success(
        `Import started for ${selected.length} ${selected.length === 1 ? labels.singular.toLowerCase() : labels.plural.toLowerCase()}.`,
        {
          action: {
            label: "View run",
            onClick: () => router.push(`${basePath}/imports?run=${body.runId}`),
          },
        },
      );
      setSelected([]);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The import could not start.",
      );
    } finally {
      setStarting(false);
    }
  }

  const refreshedAt = formatDateTime(page.status.refreshedAt);
  const filtered = Boolean(query) || filter !== "all";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <YearPicker
            ariaLabel="Academic year"
            value={page.academicYear}
            years={page.years}
            onChange={(year) => navigate({ year: String(year) })}
          />
          <p className="text-sm text-muted-foreground">
            {page.status.state === "never"
              ? "The listing has not been fetched yet."
              : page.status.state === "failed"
                ? `Last refresh failed${page.status.message ? `: ${page.status.message}` : "."}`
                : `${page.status.entryCount} listed${refreshedAt ? `, refreshed ${refreshedAt}` : ""}.`}
            {page.status.state === "available" && page.status.message ? (
              <span className="text-amber-700 dark:text-amber-400">
                {" "}
                {page.status.message}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href={`${basePath}/imports`}>
              <History size={16} aria-hidden="true" />
              Import runs
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={refreshDirectory}
            disabled={refreshing || !importsEnabled}
            type="button"
          >
            {refreshing ? (
              <LoaderCircle
                size={16}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw size={16} aria-hidden="true" />
            )}
            {refreshing ? (refreshMessage ?? "Refreshing…") : "Refresh listing"}
          </Button>
        </div>
      </div>

      <FilterBar
        searchPlaceholder={`Search ${labels.plural.toLowerCase()} by code or title`}
        filters={[
          {
            key: "status",
            label: "Status",
            allLabel: "All statuses",
            options: FILTER_OPTIONS.map((option) => ({
              ...option,
              label: `${option.label} (${page.workflowCounts[option.value as keyof typeof page.workflowCounts] ?? 0})`,
            })),
          },
        ]}
        state={{
          query,
          values: { status: filter === "all" ? "" : filter },
          onQueryChange: (value) => navigate({ q: value }),
          onFilterChange: (key, value) => navigate({ [key]: value }),
        }}
      />

      {selected.length > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm"
        >
          <span>
            {selected.length} of {MAX_SELECTION} selected: {selected.join(", ")}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected([])}
              type="button"
            >
              <X size={14} aria-hidden="true" />
              Clear selection
            </Button>
            <Button
              size="sm"
              onClick={startImport}
              disabled={starting || !importsEnabled}
              type="button"
            >
              {starting ? (
                <LoaderCircle
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Upload size={14} aria-hidden="true" />
              )}
              Import selected
            </Button>
          </div>
        </div>
      ) : null}

      {page.records.length === 0 ? (
        <CatalogueEmpty
          title={`No ${labels.plural.toLowerCase()} listed for ${page.academicYear}`}
          description={
            page.status.state === "never"
              ? "Fetch the ANU listing to see what can be imported."
              : `The ANU listing has no ${labels.plural.toLowerCase()} for this year.`
          }
          filtered={filtered}
          imports
          clearHref={`${basePath}?year=${page.academicYear}`}
          onSync={
            page.status.state === "never" && importsEnabled
              ? refreshDirectory
              : undefined
          }
        />
      ) : (
        <DataTableShell
          layout="directory"
          footer={
            <Pagination
              page={page.page}
              pageSize={page.pageSize}
              total={page.total}
              itemName={labels.plural.toLowerCase()}
              pathname={pathname}
              searchParams={Object.fromEntries(searchParams.entries())}
            />
          }
        >
          <Table>
            <TableCaption className="sr-only">
              {labels.plural} listed by ANU for {page.academicYear}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={`Select the first ${MAX_SELECTION} importable ${labels.plural.toLowerCase()}`}
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    disabled={selectable.length === 0}
                  />
                </TableHead>
                <TableHead>{labels.singular}</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Latest import</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.records.map((record) => {
                const busy =
                  record.workflow === "queued" || record.workflow === "running";
                const checked = selected.includes(record.code);
                const href = record.itemYearPublicId
                  ? `${basePath}/${record.code}?year=${page.academicYear}`
                  : undefined;
                return (
                  <TableRow
                    key={record.code}
                    data-selected={checked || undefined}
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${record.code}`}
                        checked={checked}
                        disabled={busy}
                        onCheckedChange={() => toggle(record.code)}
                      />
                    </TableCell>
                    <TableCell>
                      <CatalogueIdentity
                        code={record.code}
                        title={record.title ?? "Title not listed"}
                        kind={page.kind}
                        href={href}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {summaryLine(record) || "—"}
                    </TableCell>
                    <TableCell>
                      <WorkflowBadge status={record.workflow} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {record.latestTarget ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              className="underline-offset-4 hover:underline"
                              href={`${basePath}/imports?run=${record.latestTarget.runId}&target=${record.latestTarget.id}`}
                            >
                              {formatDateTime(
                                record.latestTarget.completedAt,
                              ) ?? "In progress"}
                            </Link>
                          </TooltipTrigger>
                          {record.latestTarget.errorMessage ? (
                            <TooltipContent className="max-w-xs">
                              {record.latestTarget.errorMessage}
                            </TooltipContent>
                          ) : null}
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DataTableShell>
      )}
    </div>
  );
}
