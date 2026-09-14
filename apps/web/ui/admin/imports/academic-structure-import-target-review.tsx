"use client";

import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { Tabs, TabsContent } from "@coursemap/ui/primitives/tabs";
import { CircleAlert } from "lucide-react";
import { AcademicStructureImportArtifactViewer } from "@/ui/admin/imports/academic-structure-import-artifact-viewer";
import {
  AcademicStructureImportDatabaseRows,
  persistedAcademicStructureDatabaseTables,
} from "@/ui/admin/imports/academic-structure-import-database-rows";
import { AcademicStructureImportPipeline } from "@/ui/admin/imports/academic-structure-import-pipeline";
import { AcademicStructureImportPreview } from "@/ui/admin/imports/academic-structure-import-preview";
import { CourseImportAutoRefresh } from "@/ui/admin/imports/course-import-auto-refresh";
import { ImportInspectionActions } from "@/ui/admin/imports/import-inspection-actions";
import {
  ImportDiagnostics,
  ImportInspectionStatus,
} from "@/ui/admin/imports/import-inspection-status";
import { AppShell } from "@/ui/shell";
import { ImportSectionTabs } from "./import-section-tabs";
import type { AcademicStructureImportTargetDetail } from "@/lib/coursemap/admin-academic-structure-imports";
import { adminAcademicStructureDetailPath } from "@/lib/coursemap/academic-structure-routes";

export function AcademicStructureImportTargetReview({
  detail,
}: {
  detail: AcademicStructureImportTargetDetail;
}) {
  const active = ["queued", "running"].includes(detail.target.processingStatus);
  const workspaceHref = detail.target.structurePublicId
    ? adminAcademicStructureDetailPath({
        kind: detail.run.structureKind,
        publicId: detail.target.structurePublicId,
      })
    : null;
  return (
    <Tabs defaultValue="pipeline" className="gap-0">
      <AppShell
        admin
        fullBleed
        fill
        currentBreadcrumbLabel={detail.target.code}
        tabs={<ImportSectionTabs />}
      >
        <CourseImportAutoRefresh active={active} />
        <div className="workspace-stack w-full px-4 py-5 sm:px-6">
          <h1 className="sr-only">{detail.target.code} import</h1>
          {detail.target.errorSummary ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{detail.target.errorSummary}</AlertDescription>
            </Alert>
          ) : null}
          <TabsContent value="pipeline" className="workspace-stack mt-0">
            <header className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-semibold">
                {detail.target.code}
              </span>
              <Badge variant="outline">{detail.run.academicYear}</Badge>
              <Badge variant="outline">Run #{detail.run.runNumber}</Badge>
              <ImportInspectionStatus
                processing={detail.target.processingStatus}
                review={detail.target.reviewStatus}
              />
              {/* The actions act on the run this header names, so they sit on
                  its line rather than floating above the section tabs. */}
              <div className="ms-auto">
                <ImportInspectionActions
                  code={detail.target.code}
                  academicYear={detail.run.academicYear}
                  requestedModel={detail.run.requestedModel}
                  structureKind={detail.run.structureKind}
                  active={active}
                  workspaceHref={workspaceHref}
                />
              </div>
            </header>
            <AcademicStructureImportPipeline
              extractions={detail.extractions}
              stages={detail.stages}
              diagnostics={
                <ImportDiagnostics
                  items={detail.reviewItems
                    .filter((item) => item.field_key !== "$")
                    .map((item) => ({
                      id: item.id,
                      field: item.field_key,
                      message: item.message,
                      sourceText: item.source_text,
                      isError: item.severity === "error",
                    }))}
                />
              }
            />
          </TabsContent>
          <TabsContent value="source" className="workspace-stack mt-0">
            <AcademicStructureImportArtifactViewer
              artifacts={detail.artifacts}
            />
          </TabsContent>
          <TabsContent value="database" className="workspace-stack mt-0">
            <AcademicStructureImportDatabaseRows
              artifacts={detail.artifacts}
              emptyLabel="0 rows"
              tables={
                detail.candidateSnapshot
                  ? persistedAcademicStructureDatabaseTables(
                      detail.relationalData,
                    )
                  : []
              }
            />
          </TabsContent>
          <TabsContent
            value="candidate"
            className="workspace-scroll mt-0"
            tabIndex={0}
          >
            <AcademicStructureImportPreview detail={detail} />
          </TabsContent>
        </div>
      </AppShell>
    </Tabs>
  );
}
