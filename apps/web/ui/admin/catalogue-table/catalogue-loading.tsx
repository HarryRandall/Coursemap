import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { AppShell } from "@/ui/shell";

import {
  DataTableShell,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
  TableCaption,
} from "./catalogue-table";

/**
 * Every grid `DataTableShell` lays out. The skeleton has to name the same one
 * the page will, or the placeholder is a different table from the one that
 * replaces it and the whole list reflows on arrival.
 */
export type CatalogueLoadingLayout =
  | "public-courses"
  | "users"
  | "directory"
  | "import-records"
  | "operations-syncs"
  | "operations-discovery";

/**
 * A skeleton cell per real cell. The kind decides the shape, so a placeholder
 * takes the space its content will.
 */
type Column = {
  label: string;
  kind: "select" | "identity" | "text" | "actions";
};

function columnsFor(noun: string, layout: CatalogueLoadingLayout): Column[] {
  if (layout === "public-courses")
    return [
      { label: "Course", kind: "identity" },
      { label: "Year", kind: "text" },
      { label: "Available", kind: "text" },
      { label: "Units", kind: "text" },
      { label: "Actions", kind: "actions" },
    ];
  if (layout === "users")
    return [
      { label: "User", kind: "identity" },
      { label: "Role", kind: "text" },
      { label: "Joined", kind: "text" },
      { label: "Updated", kind: "text" },
      { label: "Actions", kind: "actions" },
    ];
  if (layout === "operations-syncs")
    return [
      { label: "Record", kind: "identity" },
      { label: "Year", kind: "text" },
      { label: "Status", kind: "text" },
      { label: "Trigger", kind: "text" },
      { label: "Started", kind: "text" },
      { label: "Duration", kind: "text" },
      { label: "Model", kind: "text" },
      { label: "Cost", kind: "text" },
    ];
  if (layout === "operations-discovery")
    return [
      { label: "Listing", kind: "identity" },
      { label: "Year", kind: "text" },
      { label: "Status", kind: "text" },
      { label: "Complete", kind: "text" },
      { label: "Discovered", kind: "text" },
      { label: "Started", kind: "text" },
      { label: "Duration", kind: "text" },
    ];
  if (layout === "import-records")
    return [
      { label: "Import", kind: "identity" },
      { label: "Year", kind: "text" },
      { label: "Outcome", kind: "text" },
      { label: "Change", kind: "text" },
      { label: "Run", kind: "text" },
      { label: "Started", kind: "text" },
      { label: "Actions", kind: "actions" },
    ];
  return [
    { label: "Select", kind: "select" },
    { label: noun, kind: "identity" },
    { label: "Details", kind: "text" },
    { label: "Status", kind: "text" },
    { label: "Latest import", kind: "text" },
    { label: "Actions", kind: "actions" },
  ];
}

/**
 * The table skeleton without a page shell, so a `Suspense` fallback inside a
 * page that has already rendered shows the same shape `loading.tsx` did rather
 * than a second, different one.
 */
export function CatalogueTableLoading({
  noun,
  layout,
  rows = 7,
}: {
  noun: string;
  layout: CatalogueLoadingLayout;
  rows?: number;
}) {
  const columns = columnsFor(noun, layout);
  const imports = layout === "import-records";
  return (
    <div
      aria-busy="true"
      className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-4"
    >
      {layout === "directory" ? (
        // The year picker, its status line and the refresh action sit above the
        // directory's filter bar, so the skeleton holds that row open too.
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-56 max-w-[40vw]" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
      ) : null}
      {/* Search and the filter button beside it. Every table this stands in
          for offers both, so the row is held open at its full width. */}
      <div className="flex items-start gap-2">
        <Skeleton className="h-10 min-w-0 flex-1" />
        <Skeleton className="size-10 shrink-0" />
      </div>
      <DataTableShell
        imports={imports}
        layout={imports ? undefined : layout}
        selectable={false}
        footer={
          <div className="flex h-8 items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
        }
      >
        <Table>
          <TableCaption className="sr-only">Loading {noun}</TableCaption>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.label}>
                  <span className="sr-only">{column.label}</span>
                  {column.kind !== "actions" ? (
                    <Skeleton
                      className={
                        column.kind === "select"
                          ? "size-4"
                          : "h-3 w-16 max-w-full"
                      }
                    />
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }, (_, row) => (
              <TableRow key={row}>
                {columns.map((column) => (
                  <TableCell key={column.label}>
                    {column.kind === "identity" ? (
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-8 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3 w-2/3" />
                          <Skeleton className="h-2 w-14" />
                        </div>
                      </div>
                    ) : (
                      <Skeleton
                        className={
                          column.kind === "select" || column.kind === "actions"
                            ? "size-4"
                            : "h-3 w-2/3"
                        }
                      />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableShell>
    </div>
  );
}

/** A whole `loading.tsx` route: the admin shell around the table skeleton. */
export function CatalogueLoading({
  noun,
  layout,
}: {
  noun: string;
  layout: CatalogueLoadingLayout;
}) {
  return (
    <AppShell loading admin={layout !== "public-courses"} fill>
      <h1 className="sr-only">Loading {noun}</h1>
      <CatalogueTableLoading noun={noun} layout={layout} />
    </AppShell>
  );
}

/** A whole `loading.tsx` route for the imports page. */
export function ImportRecordsLoading({ noun }: { noun: string }) {
  return (
    <AppShell loading admin fill>
      <h1 className="sr-only">Loading {noun}</h1>
      <ImportRecordsSkeleton />
    </AppShell>
  );
}

/**
 * The imports page is one table of records with a filter bar above it, so its
 * skeleton is the record table and nothing else. It previously drew a run
 * table and a card beneath it, which is the stacked layout the page no longer
 * has; the route skeleton and the in-page Suspense boundary share this shape.
 */
export function ImportRecordsSkeleton() {
  return (
    <CatalogueTableLoading noun="import records" layout="import-records" />
  );
}
