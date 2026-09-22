import { Badge } from "@coursemap/ui/components/badge";
import {
  ADMIN_CATALOGUE_OPERATIONS_PATH,
  adminCatalogueSyncPath,
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
import { badgeVariantForTone } from "@/lib/ui";
import type { SyncOperationsPage } from "@/lib/coursemap/admin-operations";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { FilterBar } from "@/ui/common/filter-bar";
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { Pagination } from "@/ui/common/pagination";
import {
  formatCost,
  formatDuration,
  formatTimestamp,
  syncStatusLabel,
  syncStatusTone,
} from "./operations-format";

const STATUS_OPTIONS = [
  "queued",
  "running",
  "unchanged",
  "review_required",
  "applied",
  "failed",
  "cancelled",
].map((value) => ({ value, label: syncStatusLabel(value) }));

/** Every ANU sync, with the technical detail that belongs to operations. */
export function SyncList({ page }: { page: SyncOperationsPage }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <FilterBar
        searchPlaceholder="Search by code"
        filters={[{ key: "status", label: "Status", options: STATUS_OPTIONS }]}
      />
      {page.rows.length === 0 ? (
        <CatalogueEmpty
          title="No syncs yet"
          description="A sync appears here as soon as a record is checked against ANU."
          filtered={Boolean(page.query) || page.status !== "all"}
          clearHref={ADMIN_CATALOGUE_OPERATIONS_PATH}
        />
      ) : (
        <DataTableShell
          layout="operations-syncs"
          selectable={false}
          footer={
            <Pagination
              itemName="syncs"
              page={page.page}
              pageSize={page.pageSize}
              pathname={ADMIN_CATALOGUE_OPERATIONS_PATH}
              searchParams={{
                ...(page.query ? { q: page.query } : {}),
                ...(page.status !== "all" ? { status: page.status } : {}),
              }}
              total={page.total}
            />
          }
        >
          <Table>
            <TableCaption className="sr-only">Catalogue syncs</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Record</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((row) => (
                <LinkedTableRow key={row.id}>
                  <TableCell>
                    <CatalogueIdentity
                      code={row.kind}
                      href={adminCatalogueSyncPath(row.id)}
                      kind={row.kind}
                      title={row.code}
                    />
                  </TableCell>
                  <TableCell>{row.academicYear}</TableCell>
                  <TableCell>
                    <Badge
                      variant={badgeVariantForTone[syncStatusTone(row.status)]}
                    >
                      {syncStatusLabel(row.status)}
                    </Badge>
                    {row.attemptCount > 1 ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.attemptCount} attempts
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.trigger}</TableCell>
                  <TableCell>
                    {formatTimestamp(row.startedAt ?? row.requestedAt)}
                  </TableCell>
                  <TableCell>{formatDuration(row.durationMs)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.model ?? "—"}
                  </TableCell>
                  <TableCell>{formatCost(row.costUsd)}</TableCell>
                </LinkedTableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableShell>
      )}
    </div>
  );
}
