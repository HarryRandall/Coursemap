import { BULK_IMPORT_KINDS, importKindLabel } from "@/lib/catalogue-runs/kinds";
import Link from "next/link";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { courseRunState } from "@/lib/catalogue-runs/progress";
import type { readCourseRunHistory } from "@/lib/catalogue-runs/service";
import {
  ADMIN_COURSE_IMPORTS_PATH,
  adminCourseImportPath,
} from "@/lib/coursemap/catalogue-kinds";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
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
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { FilterBar } from "@/ui/common/filter-bar";
import { Pagination } from "@/ui/common/pagination";
import { formatTimestamp } from "./operations-format";

export function CourseImportList({
  history,
  year,
  years,
}: {
  history: Awaited<ReturnType<typeof readCourseRunHistory>>;
  year: number;
  years: number[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <FilterBar
        searchPlaceholder="Search by year or record code"
        filters={[
          {
            key: "kind",
            label: "Type",
            options: BULK_IMPORT_KINDS.map((kind) => ({
              value: kind,
              label: importKindLabel(kind),
            })),
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "finished", label: "Finished" },
              { value: "incomplete", label: "Incomplete" },
              { value: "paused", label: "Paused" },
              { value: "stopped", label: "Stopped" },
            ],
          },
          {
            key: "year",
            label: "Year",
            options: years.map((value) => ({
              value: String(value),
              label: String(value),
            })),
          },
        ]}
        actions={
          <Button variant="outline" asChild>
            <Link href={adminCourseImportPath("new", year)}>New import</Link>
          </Button>
        }
      />
      {history.runs.length === 0 ? (
        <CatalogueEmpty
          title="No bulk imports yet"
          description="Your saved imports will appear here."
          filtered={Boolean(
            history.query || history.status || history.year || history.kind,
          )}
          clearHref={ADMIN_COURSE_IMPORTS_PATH}
        />
      ) : (
        <DataTableShell
          layout="operations-imports"
          selectable={false}
          footer={
            <Pagination
              itemName="imports"
              page={history.page}
              pageSize={history.pageSize}
              pathname={ADMIN_COURSE_IMPORTS_PATH}
              searchParams={{
                q: history.query,
                kind: history.kind,
                status: history.status,
                year: history.year ? String(history.year) : undefined,
              }}
              total={history.total}
            />
          }
        >
          <Table>
            <TableCaption className="sr-only">Bulk imports</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Import</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Needs review</TableHead>
                <TableHead>Spent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.runs.map((run) => (
                <LinkedTableRow key={run.id}>
                  <TableCell>
                    <Link
                      data-row-link
                      className="font-medium text-foreground hover:underline"
                      href={adminCourseImportPath(run.id)}
                    >
                      {run.academic_year} {importKindLabel(run.kind)}
                    </Link>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatTimestamp(run.created_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        courseRunState(run, false) === "Finished"
                          ? "success-light"
                          : "secondary"
                      }
                    >
                      {courseRunState(run, false)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {run.imported} / {run.total}
                  </TableCell>
                  <TableCell>{run.published}</TableCell>
                  <TableCell>{run.review}</TableCell>
                  <TableCell className="tabular-nums">
                    US${Number(run.spent_usd).toFixed(4)}
                  </TableCell>
                </LinkedTableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableShell>
      )}
    </div>
  );
}
