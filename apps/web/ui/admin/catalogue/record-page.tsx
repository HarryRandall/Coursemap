import { notFound } from "next/navigation";
import { TabsContent } from "@coursemap/ui/primitives/tabs";
import { canManageCourseImports } from "@/lib/auth/viewer";
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
  if (!(await canManageCourseImports())) return <AccessDeniedError />;
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
  const contentVersionId = record.currentVersionId ?? record.publishedVersionId;
  const [content, courseContent, studentContent, studentCourse] =
    await Promise.all([
      contentVersionId ? loadSnapshotWrite(contentVersionId) : null,
      contentVersionId && kind === "course"
        ? loadSnapshotCoursePreview(contentVersionId)
        : null,
      record.publishedVersionId
        ? loadSnapshotWrite(record.publishedVersionId)
        : null,
      record.publishedVersionId && kind === "course"
        ? loadSnapshotCoursePreview(record.publishedVersionId)
        : null,
    ]);

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
          <RecordHeader record={record} />
          <TabsContent value="content" className="mt-0">
            {courseContent ? (
              <CoursePreview course={courseContent} />
            ) : content ? (
              <StructurePreview write={content} />
            ) : (
              <FoundationEmpty
                title={`${labels.singular} content has not been synced yet`}
                description={`This ${labels.singular.toLowerCase()} was found in ANU's ${academicYear} catalogue, but its detailed information has not been synced.`}
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
                contentVersionId
                  ? "No changes to review"
                  : "No ANU changes to review"
              }
              description={
                contentVersionId
                  ? "There are no outstanding source changes for this record."
                  : `Sync this ${labels.singular.toLowerCase()} from ANU before source changes can be detected.`
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
