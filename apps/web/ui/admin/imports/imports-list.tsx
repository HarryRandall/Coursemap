import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { badgeVariantForTone } from "@/lib/ui";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import ReuiLink from "next/link";
import { AppShell } from "@/ui/shell";

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
import { CatalogueIdentity } from "@/ui/admin/catalogue-table/catalogue-table";
import { CatalogueRowActions } from "@/ui/admin/catalogue-table/catalogue-row-actions";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";

import { Pagination } from "@/ui/common/pagination";
import { ImportsToolbar } from "@/ui/admin/imports/imports-toolbar";
import {
  isImportActive,
  importOutcome,
  type ImportListSort,
  type ImportSystem,
} from "@/lib/coursemap/import-list-query";
import type { Tone } from "@/lib/ui";
import { CourseImportAutoRefresh } from "./course-import-auto-refresh";

const dateFormatter = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Sydney",
});

function readable(value: string) {
  const words = value.replaceAll("_", " ").replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function outcomeTone(status: string): Tone {
  if (["failed", "cancelled", "rejected"].includes(status)) return "danger";
  if (["queued", "processing"].includes(status)) return "info";
  if (status === "needs-review") return "warning";
  if (status === "accepted") return "success";
  return "neutral";
}

const SORT_CAPTIONS: Record<ImportListSort, string> = {
  newest: "newest first",
  oldest: "oldest first",
  "code-asc": "by code, A to Z",
  "code-desc": "by code, Z to A",
};

export type ImportListRow = {
  publicId?: string | null;
  id: string;
  code: string;
  title: string;
  academicYear: number;
  processingStatus: string;
  reviewStatus: string;
  changeKind: string | null;
  createdAt: string;
};

export type ImportListData = {
  records: ImportListRow[];
  page: number;
  pageSize: number;
  total: number;
};

/**
 * One import per row across every catalogue object. Imports are addressed by
 * target id, so the batching run never appears in a URL or a column.
 */
export function ImportsList({
  basePath,
  data,
  heading,
  itemName,
  noun,
  plural,
  searchParams,
  sort,
  system,
}: {
  /** The object's directory path, such as "/admin/majors". */
  basePath: string;
  data: ImportListData;
  heading: string;
  itemName: string;
  /** Lower-case singular used in the empty state, such as "major". */
  noun: string;
  /** Lower-case plural used in the search placeholder, such as "majors". */
  plural: string;
  searchParams: Record<string, string | undefined>;
  sort: ImportListSort;
  system: ImportSystem;
}) {
  const importsPath = `${basePath}/imports`;
  const active = data.records.some((record) =>
    isImportActive(system, record.processingStatus),
  );
  const filtered = Boolean(searchParams.q || searchParams.status);

  return (
    <AppShell admin fill currentBreadcrumbLabel="Imports">
      <CourseImportAutoRefresh active={active} />
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-4">
        <h1 className="sr-only">{heading}</h1>

        <ImportsToolbar
          importsPath={importsPath}
          searchParams={searchParams}
          searchPlaceholder={`Search ${plural} by code or title`}
          sort={sort}
          system={system}
        />

        <DataTableShell
          imports
          footer={
            <Pagination
              alwaysShowControls
              itemName={itemName}
              page={data.page}
              pageSize={data.pageSize}
              pathname={importsPath}
              searchParams={searchParams}
              total={data.total}
            />
          }
        >
          {data.records.length === 0 ? (
            <CatalogueEmpty
              imports
              filtered={filtered}
              title="No imports yet"
              description={`Choose entries in the directory to import a ${noun}.`}
              clearHref={importsPath}
            >
              <Button asChild variant="outline">
                <ReuiLink href={basePath}>Browse {plural}</ReuiLink>
              </Button>
            </CatalogueEmpty>
          ) : (
            <Table>
              <TableCaption className="sr-only">
                {heading}, {SORT_CAPTIONS[sort]}
              </TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Import</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.records.map((record) => (
                  <LinkedTableRow key={record.id}>
                    <TableCell>
                      <CatalogueIdentity
                        code={record.code}
                        title={record.title}
                        kind={system === "course" ? "course" : noun}
                        href={
                          record.publicId
                            ? `${basePath}/${record.publicId}/history?import=${record.id}`
                            : undefined
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {record.academicYear}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          badgeVariantForTone[
                            outcomeTone(
                              importOutcome(
                                record.processingStatus,
                                record.reviewStatus,
                              ),
                            )
                          ]
                        }
                      >
                        {readable(
                          importOutcome(
                            record.processingStatus,
                            record.reviewStatus,
                          ),
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {record.changeKind ? (
                        readable(record.changeKind)
                      ) : (
                        <span className="text-muted-foreground/80">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <time
                        className="text-xs text-muted-foreground tabular-nums"
                        dateTime={record.createdAt}
                      >
                        {dateFormatter.format(new Date(record.createdAt))}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <CatalogueRowActions
                        code={record.code}
                        links={[
                          ...(record.publicId
                            ? [
                                {
                                  label: "View import",
                                  href: `${basePath}/${record.publicId}/history?import=${record.id}`,
                                },
                              ]
                            : []),
                          {
                            label: "Import history",
                            href: `${importsPath}?q=${encodeURIComponent(record.code)}`,
                            icon: "history",
                          },
                          {
                            label: "Find in directory",
                            href: `${basePath}?q=${encodeURIComponent(record.code)}&year=${record.academicYear}`,
                          },
                        ]}
                      />
                    </TableCell>
                  </LinkedTableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataTableShell>
      </div>
    </AppShell>
  );
}
