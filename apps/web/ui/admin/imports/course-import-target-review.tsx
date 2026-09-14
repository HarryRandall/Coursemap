"use client";

import { ImportEmptyState } from "./import-empty-state";
import { adminCourseDetailPath } from "@/lib/coursemap/course-routes";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { Tabs, TabsContent } from "@coursemap/ui/primitives/tabs";
import { CircleAlert } from "lucide-react";
import { CourseImportDatabaseRows } from "@/ui/admin/imports/course-import-database-rows";
import { CourseImportArtifactViewer } from "@/ui/admin/imports/course-import-artifact-viewer";
import { CourseImportAutoRefresh } from "@/ui/admin/imports/course-import-auto-refresh";
import { CourseImportPipeline } from "@/ui/admin/imports/course-import-pipeline";
import { ImportInspectionActions } from "@/ui/admin/imports/import-inspection-actions";
import { PanelTabs } from "@/ui/common/section-tabs";
import {
  ImportDiagnostics,
  ImportInspectionStatus,
} from "@/ui/admin/imports/import-inspection-status";
import {
  CourseDetailTabsList,
  CourseDetailView,
} from "@/ui/courses/course-detail-view";
import { AppShell } from "@/ui/shell";
import { ImportSectionTabs } from "./import-section-tabs";
import type { CourseImportTargetDetail } from "@/lib/coursemap/admin-course-imports";
import { persistedCourseDatabaseTables } from "@/lib/coursemap/course-import-database-view";
import type { CourseDetails } from "@/lib/coursemap/course-types";

export function CourseImportTargetReview({
  detail,
  previewCourse,
}: {
  detail: CourseImportTargetDetail;
  previewCourse: CourseDetails | null;
}) {
  const active = ["queued", "processing"].includes(
    detail.target.processingStatus,
  );
  const workspaceHref = detail.target.coursePublicId
    ? adminCourseDetailPath({
        publicId: detail.target.coursePublicId,
      })
    : null;
  return (
    <Tabs defaultValue="pipeline" className="gap-0">
      <AppShell
        admin
        fullBleed
        fill
        currentBreadcrumbLabel={detail.target.courseCode}
        tabs={<ImportSectionTabs course />}
      >
        <CourseImportAutoRefresh active={active} />
        <div className="workspace-stack w-full px-4 py-5 sm:px-6">
          <h1 className="sr-only">{detail.target.courseCode} import</h1>
          {detail.target.errorSummary ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{detail.target.errorSummary}</AlertDescription>
            </Alert>
          ) : null}
          <TabsContent value="pipeline" className="workspace-stack mt-0">
            <header className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-semibold">
                {detail.target.courseCode}
              </span>
              <Badge variant="outline">{detail.run.academicYear}</Badge>
              <ImportInspectionStatus
                processing={detail.target.processingStatus}
                review={detail.target.reviewStatus}
              />
              <div className="ms-auto">
                <ImportInspectionActions
                  code={detail.target.courseCode}
                  academicYear={detail.run.academicYear}
                  requestedModel={detail.run.requestedModel}
                  active={active}
                  workspaceHref={workspaceHref}
                />
              </div>
            </header>
            <CourseImportPipeline
              extractions={detail.extractions}
              stages={detail.stages}
              diagnostics={
                <ImportDiagnostics
                  items={detail.reviewItems
                    .filter(
                      (item) => item.issueCode !== "MANUAL_REVIEW_REQUIRED",
                    )
                    .map((item) => ({
                      id: item.id,
                      field: item.fieldPath,
                      message: item.summary,
                      sourceText: item.sourceExcerpt,
                      values: item.newValue,
                      isError: item.isBlocking,
                    }))}
                />
              }
            />
          </TabsContent>
          <TabsContent value="source" className="workspace-stack mt-0">
            <CourseImportArtifactViewer artifacts={detail.artifacts} />
          </TabsContent>
          <TabsContent value="database" className="workspace-stack mt-0">
            <CourseImportDatabaseRows
              artifacts={detail.artifacts}
              emptyLabel="0 rows"
              tables={
                detail.candidateSnapshot
                  ? persistedCourseDatabaseTables({
                      snapshot: detail.candidateSnapshot,
                      relationalData: detail.relationalData,
                    })
                  : []
              }
            />
          </TabsContent>
          <TabsContent value="preview" className="workspace-stack mt-0">
            {previewCourse ? (
              <Tabs className="workspace-stack gap-0" defaultValue="overview">
                <PanelTabs>
                  <CourseDetailTabsList />
                </PanelTabs>
                <div
                  className="workspace-scroll py-5"
                  role="region"
                  aria-label="Course preview"
                  tabIndex={0}
                >
                  <CourseDetailView
                    course={previewCourse}
                    requisiteCompletion={{
                      completedCourses: [],
                      isAuthenticated: false,
                    }}
                  />
                </div>
              </Tabs>
            ) : (
              <ImportEmptyState kind="preview" />
            )}
          </TabsContent>
        </div>
      </AppShell>
    </Tabs>
  );
}
