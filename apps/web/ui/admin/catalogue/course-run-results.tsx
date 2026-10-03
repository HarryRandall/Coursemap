import { Badge } from "@coursemap/ui/components/badge";
import {
  courseRunItemState,
  type CourseRunResults as Results,
} from "@/lib/catalogue-runs/progress";
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

export function CourseRunResults({
  results,
  reviewOnly = false,
  year,
  page,
  onPageChange,
  loading,
  query,
  outcome,
  issue,
  onQueryChange,
  onFilterChange,
}: {
  results: Results | null;
  reviewOnly?: boolean;
  year: number;
  page: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  query: string;
  outcome: string;
  issue: string;
  onQueryChange: (query: string) => void;
  onFilterChange: (key: string, value: string) => void;
}) {
  return (
    <section
      aria-label="Imported course results"
      className="workspace-stack gap-4"
      aria-busy={loading}
    >
      <FilterBar
        searchPlaceholder="Search courses by code or title"
        state={{
          query,
          values: reviewOnly ? { issue } : { outcome, issue },
          onQueryChange,
          onFilterChange,
        }}
        filters={[
          ...(!reviewOnly
            ? [
                {
                  key: "outcome",
                  label: "Outcome",
                  options: [
                    { value: "published", label: "Published" },
                    { value: "draft", label: "Draft ready" },
                    { value: "review", label: "Needs review" },
                    { value: "failed", label: "Failed" },
                    { value: "pending", label: "Pending" },
                    { value: "stopped", label: "Stopped" },
                  ],
                },
              ]
            : []),
          ...(issue
            ? [
                {
                  key: "issue",
                  label: "Issue",
                  options: [{ value: issue, label: "Selected issue" }],
                },
              ]
            : []),
        ]}
      />
      <DataTableShell
        layout="import-courses"
        selectable={false}
        footer={
          <Pagination
            itemName="courses"
            page={page}
            pageSize={results?.pageSize ?? 25}
            alwaysShowControls
            total={results?.total ?? 0}
            onPageChange={onPageChange}
          />
        }
      >
        <Table>
          <TableCaption className="sr-only">Imported courses</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Issues</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results?.items.map((item) => (
              <LinkedTableRow key={item.recordId}>
                <TableCell>
                  <CatalogueIdentity
                    code={item.code}
                    title={item.title}
                    href={`/admin/courses/${year}/${item.code}${reviewOnly ? "/changes" : ""}`}
                  />
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.status === "failed"
                        ? "destructive-light"
                        : item.published
                          ? "success-light"
                          : item.issues.length
                            ? "warning-light"
                            : "secondary"
                    }
                  >
                    {courseRunItemState(item)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.error && (
                    <p className="text-xs whitespace-normal text-destructive">
                      {item.error}
                    </p>
                  )}
                  {item.issues.length > 0 ? (
                    <details className="text-xs" open={reviewOnly}>
                      <summary className="cursor-pointer">
                        {item.issues.length}{" "}
                        {item.issues.length === 1 ? "issue" : "issues"}
                      </summary>
                      <ul className="mt-2 list-disc space-y-2 pl-4 whitespace-normal">
                        {item.issues.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    !item.error && <span>--</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.actualUsd === null
                    ? "Pending"
                    : item.actualUsd === 0
                      ? "No AI charge"
                      : `US$${item.actualUsd.toFixed(4)}`}
                </TableCell>
              </LinkedTableRow>
            ))}
            {!results?.items.length && (
              <TableRow>
                <TableCell
                  className="col-span-full py-8 text-center"
                  role="status"
                >
                  {!results
                    ? "Loading course results..."
                    : query || outcome || issue
                      ? "No courses match your search or filters."
                      : "No course results yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DataTableShell>
    </section>
  );
}
