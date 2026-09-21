"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CATALOGUE_KIND_LABELS,
  type CatalogueDirectoryPage,
  adminCatalogueRecordPath,
  adminCatalogueYearPath,
} from "@/lib/coursemap/catalogue-kinds";
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
import { FilterBar } from "@/ui/common/filter-bar";
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { Pagination } from "@/ui/common/pagination";
import { YearPicker } from "@/ui/common/year-picker";
import { readImportStream } from "./import-stream";

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function CatalogueDirectory({ page }: { page: CatalogueDirectoryPage }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const labels = CATALOGUE_KIND_LABELS[page.kind];
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
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
    setRefreshMessage("Contacting ANU...");
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
      });
      toast.success("ANU listing refreshed.");
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
          {refreshMessage ?? "Refresh ANU listing"}
        </Button>
      </div>
      {page.status.message ? (
        <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
          {page.status.message}
        </p>
      ) : null}
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
                <TableHead>Publication</TableHead>
                <TableHead>ANU</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.records.map((record) => {
                const href = adminCatalogueRecordPath(
                  page.kind,
                  page.academicYear,
                  record.code,
                );
                return (
                  <LinkedTableRow key={record.code}>
                    <TableCell>
                      <CatalogueIdentity
                        code={record.code}
                        title={record.title ?? "Title not available"}
                        kind={page.kind}
                        href={href}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          record.isPublished ? "success-light" : "outline"
                        }
                      >
                        {record.isPublished ? "Published" : "Not published"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {record.isListedByAnu === false ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                          <TriangleAlert size={15} aria-hidden="true" />
                          No longer listed by ANU
                          {record.lastSeenAt
                            ? ` · Last seen ${formatDate(record.lastSeenAt)}`
                            : ""}
                        </span>
                      ) : record.isListedByAnu ? (
                        <span className="text-sm">Listed by ANU</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Never synced
                        </span>
                      )}
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
