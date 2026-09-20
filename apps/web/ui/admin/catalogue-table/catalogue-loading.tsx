import { Card, CardContent, CardHeader } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { AppShell } from "@/ui/shell";
import { DataTableShell as PlainTableShell } from "@/ui/common/data-table";

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
  "public-courses" | "users" | "directory" | "import-targets";

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
      { label: "Requisites", kind: "text" },
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
  if (layout === "import-targets")
    return [
      { label: "Import", kind: "identity" },
      { label: "Year", kind: "text" },
      { label: "Outcome", kind: "text" },
      { label: "Change", kind: "text" },
      { label: "Attempts", kind: "text" },
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
  const imports = layout === "import-targets";
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
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-4 w-56 max-w-[40vw]" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
      ) : null}
      {imports ? null : <Skeleton className="h-10 w-full shrink-0" />}
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

/**
 * The import runs page: the toolbar and run table it opens with, then the
 * selected run's card. A plain table skeleton alone sat in front of a card
 * layout and moved everything down as soon as the data arrived.
 */
export function ImportRunsLoading({ noun }: { noun: string }) {
  return (
    <AppShell loading admin fill>
      <h1 className="sr-only">Loading {noun}</h1>
      <div
        aria-busy="true"
        className="flex min-h-0 w-full flex-1 flex-col gap-4"
      >
        <div className="flex items-start gap-2">
          <Skeleton className="h-10 min-w-0 flex-1" />
          <Skeleton className="size-10 shrink-0" />
        </div>
        <PlainTableShell
          footer={
            <div className="flex h-8 items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
            </div>
          }
        >
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }, (_, row) => (
              <div key={row} className="flex items-center gap-4">
                <Skeleton className="h-3 w-10 shrink-0" />
                <Skeleton className="h-3 w-12 shrink-0" />
                <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
                <Skeleton className="h-3 w-14 shrink-0" />
                <Skeleton className="h-3 min-w-0 flex-1" />
                <Skeleton className="h-3 w-16 shrink-0" />
                <Skeleton className="h-3 w-28 shrink-0" />
              </div>
            ))}
          </div>
        </PlainTableShell>
        <Card>
          <CardHeader className="gap-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </CardHeader>
          <CardContent>
            <CatalogueTableLoading
              noun="import records"
              layout="import-targets"
              rows={4}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
