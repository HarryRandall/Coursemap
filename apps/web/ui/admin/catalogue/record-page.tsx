import { notFound } from "next/navigation";
import { TabsContent } from "@coursemap/ui/primitives/tabs";
import {
  canManageCourseImports,
  canWriteCatalogue,
  getAuthViewer,
} from "@/lib/auth/viewer";
import {
  createCatalogueDraft,
  loadCatalogueDraft,
} from "@/lib/catalogue/drafts";
import { contentHashForCatalogueContent } from "@/lib/catalogue-import/version-content";
import {
  loadCatalogueRecord,
  loadSnapshotCoursePreview,
  loadSnapshotWrite,
} from "@/lib/coursemap/admin-catalogue-record";
import {
  CATALOGUE_KIND_LABELS,
  type CatalogueKind,
  adminCatalogueRecordPath,
} from "@/lib/coursemap/catalogue-kinds";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import { AppShell } from "@/ui/shell";
import { RecordHeader } from "./record-header";
import { RecordHistory } from "./record-history";
import { RecordTabList, RecordTabs, type RecordSection } from "./record-tabs";
import { CatalogueContentEditor } from "./content-editor";
import { CoursePreview, StructurePreview } from "./version-preview";

function FoundationEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <h2 className="font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export async function CatalogueRecordPage({
  kind,
  code,
  academicYear,
  section = "content",
}: {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
  section?: RecordSection;
}) {
  const [canManageImports, canWrite] = await Promise.all([
    canManageCourseImports(),
    canWriteCatalogue(),
  ]);
  if (!canManageImports && !canWrite) return <AccessDeniedError />;
  if (
    !Number.isInteger(academicYear) ||
    academicYear < 2020 ||
    academicYear > 2030
  )
    notFound();
  const record = await loadCatalogueRecord({ kind, code, academicYear });
  if (!record) notFound();

  const labels = CATALOGUE_KIND_LABELS[kind];
  const path = adminCatalogueRecordPath(kind, academicYear, record.code);
  const viewer = canWrite ? await getAuthViewer() : null;
  const draft =
    section === "content" && viewer
      ? await createCatalogueDraft({
          recordId: record.recordId,
          userId: viewer.id,
        })
      : await loadCatalogueDraft(record.recordId);
  const [studentContent, studentCourse] = await Promise.all([
    record.publishedVersionId
      ? loadSnapshotWrite(record.publishedVersionId)
      : null,
    record.publishedVersionId && kind === "course"
      ? loadSnapshotCoursePreview(record.publishedVersionId)
      : null,
  ]);
  const hasUnpublishedChanges = Boolean(
    draft &&
    (!studentContent ||
      draft.contentHash !== contentHashForCatalogueContent(studentContent)),
  );

  return (
    <RecordTabs value={section} path={path}>
      <AppShell
        admin
        currentBreadcrumbLabel={record.code}
        breadcrumbSegmentLabels={{
          [labels.segment]: labels.plural,
          [String(academicYear)]: String(academicYear),
        }}
        tabs={<RecordTabList />}
      >
        <div className="flex w-full min-w-0 flex-col gap-6">
          <RecordHeader
            record={record}
            hasDraft={draft !== null}
            hasUnpublishedChanges={hasUnpublishedChanges}
          />
          <TabsContent value="content" className="mt-0">
            {draft && canWrite ? (
              <CatalogueContentEditor
                key={`${draft.contentHash}:${draft.revision}:${record.publishedVersionId ?? "unpublished"}`}
                initial={draft.content}
                recordId={record.recordId}
                initialRevision={draft.revision}
                initiallyPublished={record.publishedVersionId !== null}
                initialHasUnpublishedChanges={hasUnpublishedChanges}
                path={path}
              />
            ) : draft ? (
              <StructurePreview write={draft.content} />
            ) : (
              <FoundationEmpty
                title={`${labels.singular} content is not available`}
                description={`You need catalogue write permission to author this ${labels.singular.toLowerCase()}.`}
              />
            )}
          </TabsContent>
          <TabsContent value="student-view" className="mt-0">
            {studentCourse ? (
              <CoursePreview course={studentCourse} />
            ) : studentContent ? (
              <StructurePreview write={studentContent} />
            ) : (
              <FoundationEmpty
                title={`This ${labels.singular.toLowerCase()} hasn't been published yet`}
                description="Student view will show the published version when one is available."
              />
            )}
          </TabsContent>
          <TabsContent value="changes" className="mt-0">
            <FoundationEmpty
              title={
                hasUnpublishedChanges
                  ? "Unpublished changes"
                  : "No unpublished changes"
              }
              description={
                hasUnpublishedChanges
                  ? "The Content tab contains saved work that students will not see until it is published."
                  : "The working draft matches the published content."
              }
            />
          </TabsContent>
          <TabsContent value="changelog" className="mt-0">
            <RecordHistory record={record} />
          </TabsContent>
        </div>
      </AppShell>
    </RecordTabs>
  );
}
