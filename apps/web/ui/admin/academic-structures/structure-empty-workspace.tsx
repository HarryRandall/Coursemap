"use client";
import {
  catalogueWorkspacePath,
  catalogueWorkspaceView,
} from "@/lib/coursemap/catalogue-workspace-routes";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@coursemap/ui/primitives/tabs";
import { AppShell } from "@/ui/shell";
import { CatalogueImportEmpty } from "@/ui/admin/imports/catalogue-import-empty";
import { CatalogueImportButton } from "@/ui/admin/imports/catalogue-import-button";
import { CourseImportAutoRefresh } from "@/ui/admin/imports/course-import-auto-refresh";
import { StructureImportHistory } from "./structure-import-history";
import type { StructureWorkspaceEntry } from "@/lib/coursemap/structure-workspace-entry";
import type { AcademicStructureImportTargetDetail } from "@/lib/coursemap/admin-academic-structure-imports";

export function StructureEmptyWorkspace({
  entry,
  detail,
  canImport,
}: {
  entry: StructureWorkspaceEntry;
  detail: AcademicStructureImportTargetDetail | null;
  canImport: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();
  const active = entry.imports.some((item) =>
    ["queued", "running", "processing"].includes(item.processing_status),
  );
  const history =
    catalogueWorkspaceView(pathname, new URLSearchParams(query.toString())) ===
      "history" && entry.imports.length > 0;
  function select(view: string) {
    const params = new URLSearchParams(query.toString());
    params.delete("import");
    router.replace(catalogueWorkspacePath(pathname, view, params.toString()), {
      scroll: false,
    });
  }
  return (
    <Tabs
      value={history ? "history" : "review"}
      onValueChange={select}
      className="block"
    >
      <AppShell
        admin
        fill
        fullBleed
        currentBreadcrumbLabel={history ? "History" : entry.code}
        breadcrumbSegmentLabels={{
          [String(entry.year)]: entry.code,
          [entry.publicId ?? entry.code]: entry.code,
        }}
        tabs={
          entry.imports.length ? (
            <TabsList variant="line">
              <TabsTrigger value="review">Review</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="preview" disabled>
                Preview
              </TabsTrigger>
            </TabsList>
          ) : undefined
        }
      >
        <CourseImportAutoRefresh active={active} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7 md:overflow-y-auto">
          {history ? (
            <>
              <div className="flex justify-end">
                <CatalogueImportButton
                  code={entry.code}
                  kind={entry.kind}
                  year={entry.year}
                  disabled={!canImport || active}
                  label={active ? "Import in progress" : "Re-import"}
                  onStarted={() => select("history")}
                />
              </div>
              <StructureImportHistory entry={entry} detail={detail} />
            </>
          ) : (
            <CatalogueImportEmpty
              code={entry.code}
              kind={entry.kind}
              year={entry.year}
              active={active}
              hasImports={entry.imports.length > 0}
              canImport={canImport}
              onStarted={() => select("history")}
            />
          )}
        </div>
      </AppShell>
    </Tabs>
  );
}
