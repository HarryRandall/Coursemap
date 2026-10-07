import type { SeltAdminReportPage } from "@/lib/selt/admin";
import { SELT_ADMIN_PATH, SELT_REPORT_STATUSES } from "@/lib/selt/admin-format";
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
import { SeltStatusBadge } from "@/ui/admin/selt/selt-status-badge";
import { FilterBar } from "@/ui/common/filter-bar";
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { Pagination } from "@/ui/common/pagination";
import { Sparkline } from "@/ui/common/sparkline";
import { formatCanberraDay } from "@/lib/canberra-format";

export function SeltReportTable({ page }: { page: SeltAdminReportPage }) {
  const filters = {
    ...(page.query ? { q: page.query } : {}),
    ...(page.status ? { status: page.status } : {}),
  };
  const reviewHref = (id: string) =>
    `${SELT_ADMIN_PATH}?${new URLSearchParams({
      ...filters,
      ...(page.page > 1 ? { page: String(page.page) } : {}),
      report: id,
    })}`;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <FilterBar
        searchPlaceholder="Search by code or name"
        filters={[
          {
            key: "status",
            label: "Status",
            options: SELT_REPORT_STATUSES.map((status) => ({ ...status })),
          },
        ]}
      />
      {page.rows.length === 0 ? (
        <CatalogueEmpty
          title="No reports uploaded yet"
          description="Create an import token under Import access, then run the local import script."
          filtered={Boolean(page.query) || page.status !== null}
          clearHref={SELT_ADMIN_PATH}
        />
      ) : (
        <DataTableShell
          layout="selt-reports"
          selectable={false}
          footer={
            <Pagination
              itemName="reports"
              page={page.page}
              pageSize={page.pageSize}
              pathname={SELT_ADMIN_PATH}
              searchParams={filters}
              total={page.total}
            />
          }
        >
          <Table>
            <TableCaption className="sr-only">SELT reports</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Semesters</TableHead>
                <TableHead>Overall experience</TableHead>
                <TableHead className="text-right">Latest</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((row) => {
                const overall = row.overall.filter(
                  (value): value is number => value !== null,
                );
                return (
                  <LinkedTableRow key={row.id}>
                    <TableCell>
                      <CatalogueIdentity
                        code={row.code}
                        title={row.courseName}
                        href={reviewHref(row.id)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {row.periods}
                      {row.firstYear ? (
                        <span className="ml-1.5 text-xs">
                          {row.firstYear === row.lastYear
                            ? row.firstYear
                            : `${row.firstYear}–${String(row.lastYear).slice(2)}`}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {overall.length > 1 ? (
                        <Sparkline
                          variant="line"
                          baseline="data"
                          values={overall}
                          label={`${row.code} overall experience by semester`}
                          className="w-28"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not enough semesters
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {overall.length ? `${overall.at(-1)}%` : "–"}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col items-start gap-1">
                        <SeltStatusBadge status={row.status} />
                        {row.replacesPublished && row.status !== "published" ? (
                          <span className="text-[11px] text-muted-foreground">
                            Replaces published report
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatCanberraDay(row.createdAt)}
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
