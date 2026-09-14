"use client";

import { useState, useSyncExternalStore } from "react";
import { Tabs, TabsList, TabsTrigger } from "@coursemap/ui/primitives/tabs";
import { FilterBar } from "@/ui/common/filter-bar";
import { JsonCode } from "@/ui/common/json-code";
import {
  filterImportDatabaseTables,
  importDatabaseTableLabel,
} from "@/lib/coursemap/import-database-labels";
import { DatabaseScrollPreview } from "./database-scroll-preview";
import { ArtefactViewport } from "./artefact-viewport";
import { ImportDatabaseRowTable } from "./import-database-row-table";

const subscribe = () => () => {};
const localTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimezone = () => "UTC";

export function DatabaseRowsViewer({
  tables,
  label = "Database rows",
}: {
  tables: { name: string; rows: unknown[] }[];
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({
    table: "",
    rows: "",
  });
  const [selected, setSelected] = useState("");
  const [view, setView] = useState("table");
  const timezone = useSyncExternalStore(
    subscribe,
    localTimezone,
    serverTimezone,
  );
  const visible = filterImportDatabaseTables(tables, query, true).filter(
    (table) =>
      (!filters.table || table.name === filters.table) &&
      (!filters.rows ||
        (filters.rows === "empty"
          ? table.rows.length === 0
          : table.rows.length > 0)),
  );
  const selectedTable =
    visible.find((table) => table.name === selected) ?? visible[0];
  const selectedLabel = selectedTable
    ? importDatabaseTableLabel(selectedTable.name)
    : "No matching tables";

  return (
    <div className="workspace-stack">
      <FilterBar
        searchPlaceholder="Search tables"
        filters={[
          {
            key: "table",
            label: "Table",
            allLabel: "All tables",
            options: tables.map((table) => ({
              value: table.name,
              label: importDatabaseTableLabel(table.name),
            })),
          },
          {
            key: "rows",
            label: "Rows",
            allLabel: "All tables",
            options: [
              { value: "populated", label: "Has rows" },
              { value: "empty", label: "Empty" },
            ],
          },
        ]}
        state={{
          query,
          values: filters,
          onQueryChange: setQuery,
          onFilterChange: (key, value) =>
            setFilters((current) => ({ ...current, [key]: value })),
        }}
      />
      <div className="grid min-h-0 min-w-0 gap-4 md:flex-1 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
        <div className="min-h-0">
          <DatabaseScrollPreview className="h-48 md:h-full">
            <nav
              aria-label="Database tables"
              className="flex flex-col gap-1 pr-3"
            >
              {visible.map((entry) => (
                <button
                  type="button"
                  key={entry.name}
                  title={entry.name}
                  aria-current={
                    selectedTable?.name === entry.name ? "true" : undefined
                  }
                  onClick={() => setSelected(entry.name)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${selectedTable?.name === entry.name ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                >
                  <span className="min-w-0">
                    {importDatabaseTableLabel(entry.name)}
                  </span>
                  <span className="ml-auto shrink-0 text-xs tabular-nums">
                    {entry.rows.length.toLocaleString("en-AU")}
                  </span>
                </button>
              ))}
              {visible.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  No matching tables.
                </p>
              )}
            </nav>
          </DatabaseScrollPreview>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border">
          <ArtefactViewport
            label={label}
            customScrollbar
            toolbar={
              <>
                <span
                  title={selectedTable?.name}
                  className="min-w-0 text-sm font-medium"
                >
                  {selectedLabel}
                </span>
                <Tabs value={view} onValueChange={setView} className="ml-auto">
                  <TabsList aria-label="Database preview format">
                    <TabsTrigger value="table">Table</TabsTrigger>
                    <TabsTrigger value="json">JSON</TabsTrigger>
                  </TabsList>
                </Tabs>
              </>
            }
          >
            {view === "json" ? (
              <JsonCode
                label={`${selectedLabel} JSON`}
                value={selectedTable?.rows ?? []}
                uncapped
                borderTop={false}
              />
            ) : selectedTable?.rows.length ? (
              <ImportDatabaseRowTable
                rows={selectedTable.rows}
                tableName={selectedTable.name}
                timezone={timezone}
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                {selectedTable
                  ? "No rows in this table."
                  : "Try another search or clear the filters."}
              </p>
            )}
          </ArtefactViewport>
        </div>
      </div>
    </div>
  );
}
