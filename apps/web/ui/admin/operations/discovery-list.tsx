"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { useSearchParams } from "next/navigation";
import { CATALOGUE_KINDS } from "@/lib/catalogue/content";
import {
  ADMIN_CATALOGUE_OPERATIONS_PATH,
  CATALOGUE_KIND_LABELS,
  adminCatalogueDiscoveryPath,
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
import type { DiscoveryCheckRow } from "@/lib/coursemap/admin-operations";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { FilterBar, type FilterConfig } from "@/ui/common/filter-bar";
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { formatDuration, formatTimestamp } from "./operations-format";

const DISCOVERY_PATH = `${ADMIN_CATALOGUE_OPERATIONS_PATH}/discovery`;

function discoveryFilters(checks: DiscoveryCheckRow[]): FilterConfig[] {
  const years = [...new Set(checks.map((check) => check.academicYear))].sort(
    (left, right) => right - left,
  );
  return [
    {
      key: "kind",
      label: "Listing",
      options: CATALOGUE_KINDS.map((kind) => ({
        value: kind,
        label: CATALOGUE_KIND_LABELS[kind].plural,
      })),
    },
    {
      key: "year",
      label: "Year",
      options: years.map((year) => ({
        value: String(year),
        label: String(year),
      })),
    },
    {
      key: "status",
      label: "Status",
      options: [
        { value: "running", label: "Running" },
        { value: "completed", label: "Completed" },
        { value: "failed", label: "Failed" },
      ],
    },
    {
      key: "complete",
      label: "Completeness",
      options: [
        { value: "complete", label: "Complete" },
        { value: "partial", label: "Partial" },
      ],
    },
  ];
}

/**
 * ANU listing checks. An incomplete check is why a record can be missing from
 * the directory without anything having been retired.
 */
export function DiscoveryList({ checks }: { checks: DiscoveryCheckRow[] }) {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLocaleLowerCase();
  const kind = searchParams.get("kind") ?? "";
  const year = searchParams.get("year") ?? "";
  const status = searchParams.get("status") ?? "";
  const completeness = searchParams.get("complete") ?? "";
  const filtered = Boolean(query || kind || year || status || completeness);
  const visibleChecks = checks.filter((check) => {
    const labels = CATALOGUE_KIND_LABELS[check.kind];
    const matchesQuery =
      !query ||
      [
        check.kind,
        labels.singular,
        labels.plural,
        String(check.academicYear),
        check.status,
        check.isComplete ? "complete" : "partial",
      ].some((value) => value.toLocaleLowerCase().includes(query));
    return (
      matchesQuery &&
      (!kind || check.kind === kind) &&
      (!year || String(check.academicYear) === year) &&
      (!status || check.status === status) &&
      (!completeness ||
        completeness === (check.isComplete ? "complete" : "partial"))
    );
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <FilterBar
        searchPlaceholder="Search listing checks"
        filters={discoveryFilters(checks)}
      />
      {visibleChecks.length === 0 ? (
        <CatalogueEmpty
          title="No listing checks yet"
          description="Refreshing an ANU listing records what it read and what it found."
          filtered={filtered}
          clearHref={DISCOVERY_PATH}
        />
      ) : (
        <DataTableShell layout="operations-discovery" selectable={false}>
          <Table>
            <TableCaption className="sr-only">ANU listing checks</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Complete</TableHead>
                <TableHead>Discovered</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleChecks.map((check) => (
                <LinkedTableRow key={check.id}>
                  <TableCell>
                    <CatalogueIdentity
                      code={`${check.discoveredCount} discovered`}
                      href={adminCatalogueDiscoveryPath(check.id)}
                      kind={check.kind}
                      title={CATALOGUE_KIND_LABELS[check.kind].plural}
                    />
                  </TableCell>
                  <TableCell>{check.academicYear}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        check.status === "failed"
                          ? "destructive-light"
                          : check.status === "completed"
                            ? "success-light"
                            : "info-light"
                      }
                    >
                      {check.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {check.isComplete ? (
                      "Complete"
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">
                        Partial
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{check.discoveredCount}</TableCell>
                  <TableCell>{formatTimestamp(check.startedAt)}</TableCell>
                  <TableCell>{formatDuration(check.durationMs)}</TableCell>
                </LinkedTableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableShell>
      )}
    </div>
  );
}
