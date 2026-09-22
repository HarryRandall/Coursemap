import {
  CATALOGUE_KIND_LABELS,
  adminCatalogueDiscoveryPath,
} from "@/lib/coursemap/catalogue-kinds";
import { Badge } from "@coursemap/ui/components/badge";
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
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { formatDuration, formatTimestamp } from "./operations-format";

/**
 * ANU listing checks. An incomplete check is why a record can be missing from
 * the directory without anything having been retired.
 */
export function DiscoveryList({ checks }: { checks: DiscoveryCheckRow[] }) {
  if (checks.length === 0) {
    return (
      <CatalogueEmpty
        title="No listing checks yet"
        description="Refreshing an ANU listing records what it read and what it found."
      />
    );
  }
  return (
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
          {checks.map((check) => (
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
  );
}
