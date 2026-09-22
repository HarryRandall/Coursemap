import Link from "next/link";
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
import type { DiscoveryCheckRow } from "@/lib/coursemap/admin-operations";
import { DataTableEmpty, DataTableShell } from "@/ui/common/data-table";
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { formatDuration, formatTimestamp } from "./operations-format";
import { CATALOGUE_OPERATIONS_PATH } from "./operations-tabs";

/**
 * ANU listing checks. An incomplete check is why a record can be missing from
 * the directory without anything having been retired.
 */
export function DiscoveryList({ checks }: { checks: DiscoveryCheckRow[] }) {
  if (checks.length === 0) {
    return (
      <DataTableEmpty
        title="No listing checks yet"
        description="Refreshing an ANU listing records what it read and what it found."
      />
    );
  }
  return (
    <DataTableShell>
      <Table className="min-w-[52rem]">
        <TableCaption className="sr-only">ANU listing checks</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
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
                <Link
                  className="font-medium"
                  href={`${CATALOGUE_OPERATIONS_PATH}/discovery/${check.id}`}
                >
                  {check.kind}
                </Link>
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
