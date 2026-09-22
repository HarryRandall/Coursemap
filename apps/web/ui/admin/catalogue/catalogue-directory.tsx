"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { catalogueSummaryMeta } from "@/lib/coursemap/catalogue-summary";
import {
  CATALOGUE_KIND_LABELS,
  type CatalogueDirectoryPage,
  adminCatalogueRecordPath,
  adminCatalogueYearPath,
} from "@/lib/coursemap/catalogue-kinds";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { CatalogueStateBadge } from "@/ui/admin/catalogue-table/catalogue-state-badge";
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
import { DirectoryRowActions } from "@/ui/admin/catalogue/directory-row-actions";
import { FilterBar } from "@/ui/common/filter-bar";
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { Pagination } from "@/ui/common/pagination";
import { startTask } from "@/ui/common/task-toast";
import { YearPicker } from "@/ui/common/year-picker";
import { readImportStream } from "./import-stream";

/** The column is scanned, so the year is dropped once it is the obvious one. */
function shortDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === new Date().getFullYear()
      ? {}
      : { year: "numeric" }),
  }).format(date);
}

/** The whole timestamp, for the hover that answers "when exactly?". */
function fullDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Each phase of the refresh gets a stretch of the bar: where it starts, which
 * is what the work has reported, and where it ends, which the bar drifts
 * towards while the phase lasts. ANU answers some phases instantly, so
 * without the stretch the bar would be still for a second and then teleport.
 */
const REFRESH_PHASES: Record<string, { percent: number; ceiling: number }> = {
  fetching: { percent: 12, ceiling: 62 },
  saving: { percent: 68, ceiling: 92 },
  done: { percent: 94, ceiling: 99 },
};

type RefreshResult = {
  entryCount?: number;
  added?: number;
  updated?: number;
  retired?: number;
  isComplete?: boolean;
};

/** What the refresh actually did, rather than that it happened. */
function refreshSummary(result: RefreshResult) {
  const entries = `${(result.entryCount ?? 0).toLocaleString("en-AU")} ${
    result.entryCount === 1 ? "entry" : "entries"
  }`;
  const changes = [
    result.added ? `${result.added} added` : null,
    result.updated ? `${result.updated} updated` : null,
    result.retired ? `${result.retired} retired` : null,
  ].filter(Boolean);
  return `${entries} · ${changes.length ? changes.join(", ") : "no changes"}`;
}

export function CatalogueDirectory({ page }: { page: CatalogueDirectoryPage }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const labels = CATALOGUE_KIND_LABELS[page.kind];
  const [refreshing, setRefreshing] = useState(false);
  const [, startTransition] = useTransition();
  const filtered = Boolean(searchParams.get("q"));

  function changeYear(year: number | "all") {
    if (year === "all") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    startTransition(() => {
      const path = adminCatalogueYearPath(page.kind, year);
      router.replace(`${path}${next.size ? `?${next}` : ""}`);
    });
  }

  async function refreshDirectory() {
    setRefreshing(true);
    const task = startTask({
      id: `directory:${page.kind}:${page.academicYear}`,
      title: `Refreshing the ANU ${labels.singular.toLowerCase()} listing`,
      detail: "Contacting ANU.",
      ceiling: 10,
    });
    try {
      const response = await fetch("/api/admin/catalogue-directory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: page.kind,
          academicYear: page.academicYear,
        }),
      });
      let result: RefreshResult = {};
      await readImportStream(response, (event) => {
        if (event.type === "started") {
          task.step({ percent: 4, ceiling: 20, detail: "Contacting ANU." });
        }
        if (event.type === "progress" && typeof event.message === "string") {
          const phase = REFRESH_PHASES[String(event.phase)] ?? {
            percent: 50,
            ceiling: 80,
          };
          task.step({ ...phase, detail: event.message });
        }
        if (event.type === "complete" && event.result) {
          result = event.result as RefreshResult;
        }
      });
      const outcome = {
        title: `${page.academicYear} ${labels.plural.toLowerCase()} refreshed`,
        detail: refreshSummary(result),
      };
      if (result.isComplete === false) {
        task.note({
          ...outcome,
          detail: `${outcome.detail}. The listing may be incomplete, so nothing was retired.`,
        });
      } else {
        task.done(outcome);
      }
      router.refresh();
    } catch (error) {
      task.fail({
        title: "The ANU listing refresh failed",
        detail: error instanceof Error ? error.message : "The refresh failed.",
        retry: refreshDirectory,
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <YearPicker
          ariaLabel="Academic year"
          value={page.academicYear}
          years={page.years}
          onChange={changeYear}
        />
        <Button
          variant="outline"
          onClick={refreshDirectory}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? (
            <LoaderCircle
              className="animate-spin"
              size={16}
              aria-hidden="true"
            />
          ) : (
            <RefreshCw size={16} aria-hidden="true" />
          )}
          Refresh ANU listing
        </Button>
      </div>
      <FilterBar
        searchPlaceholder={`Search ${labels.plural.toLowerCase()} by code or title`}
      />
      {page.records.length === 0 ? (
        <CatalogueEmpty
          title={`No ${labels.plural.toLowerCase()} for ${page.academicYear}`}
          description={
            filtered
              ? "No records match this search."
              : page.status.state === "never"
                ? "Refresh the ANU listing to discover records for this year."
                : `ANU has not listed any ${labels.plural.toLowerCase()} for this year.`
          }
          filtered={filtered}
          clearHref={pathname}
          onSync={page.status.state === "never" ? refreshDirectory : undefined}
          syncing={refreshing}
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
              {labels.plural} for {page.academicYear}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.singular}</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.records.map((record) => {
                const href = adminCatalogueRecordPath(
                  page.kind,
                  page.academicYear,
                  record.code,
                );
                const updated = record.latestSync?.completedAt ?? null;
                return (
                  <LinkedTableRow key={record.code}>
                    <TableCell>
                      <CatalogueIdentity
                        code={record.code}
                        title={record.title ?? "Title not available"}
                        kind={page.kind}
                        href={href}
                        meta={catalogueSummaryMeta(record.summary, page.kind)}
                      />
                    </TableCell>
                    <TableCell>
                      <CatalogueStateBadge record={record} />
                    </TableCell>
                    <TableCell
                      className="tabular-nums"
                      title={updated ? fullDate(updated) : undefined}
                    >
                      {updated ? (
                        shortDate(updated)
                      ) : (
                        <span className="text-muted-foreground/70">
                          Never synced
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DirectoryRowActions
                        academicYear={page.academicYear}
                        kind={page.kind}
                        record={record}
                      />
                    </TableCell>
                  </LinkedTableRow>
                );
              })}
            </TableBody>
          </Table>
        </DataTableShell>
      )}
    </div>
  );
}
