"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import type { CourseRunProgress } from "@/lib/catalogue-runs/progress";
import { Pagination } from "@/ui/common/pagination";
import { FilterBar } from "@/ui/common/filter-bar";
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

export function CourseRunReview({
  run,
  onViewCourses,
  children,
}: {
  run?: CourseRunProgress;
  children: ReactNode;
  onViewCourses: (issue?: string) => void;
}) {
  const [grouped, setGrouped] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  if (!run) return null;
  const blockers = run.publication_blockers.filter((blocker) =>
    blocker.reason.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const safePage = Math.min(page, Math.max(1, Math.ceil(blockers.length / 25)));
  return (
    <div className="workspace-stack gap-4">
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Review view"
      >
        <Button
          variant={grouped ? "ghost" : "secondary"}
          size="sm"
          onClick={() => setGrouped(false)}
        >
          Records needing review
        </Button>
        <Button
          variant={grouped ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setGrouped(true)}
        >
          Grouped issues
        </Button>
      </div>
      {!!run.published_drafts && (
        <p className="text-sm text-warning">
          {run.published_drafts} published{" "}
          {run.published_drafts === 1 ? "record has" : "records have"} separate
          draft changes.
        </p>
      )}
      {grouped ? (
        <>
          <FilterBar
            searchPlaceholder="Search review issues"
            state={{
              query,
              values: {},
              onQueryChange: (value) => {
                setQuery(value);
                setPage(1);
              },
              onFilterChange: () => {},
            }}
          />
          <DataTableShell
            layout="import-review"
            selectable={false}
            footer={
              <Pagination
                itemName="issues"
                page={safePage}
                pageSize={25}
                total={blockers.length}
                onPageChange={setPage}
                alwaysShowControls
              />
            }
          >
            <Table>
              <TableCaption className="sr-only">
                Publication review issues
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead className="text-right">Affected records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blockers
                  .slice((safePage - 1) * 25, safePage * 25)
                  .map((blocker) => (
                    <TableRow key={blocker.reason}>
                      <TableCell className="whitespace-normal">
                        {blocker.reason}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            onViewCourses(blocker.reason);
                            setGrouped(false);
                          }}
                          aria-label={`View ${blocker.courses} ${blocker.courses === 1 ? "record" : "records"}: ${blocker.reason}`}
                        >
                          {blocker.courses}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                {!blockers.length && (
                  <TableRow>
                    <TableCell className="col-span-full py-8 text-center">
                      {query
                        ? "No issues match your search."
                        : run.review
                          ? "Open the records needing review for their source changes."
                          : "No publication issues."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DataTableShell>
        </>
      ) : (
        children
      )}
    </div>
  );
}
