import { catalogueWorkspaceIdentity } from "@/lib/coursemap/catalogue-workspace-identity";
import {
  loadCatalogueSectionReview,
  loadCatalogueReviewHistory,
} from "@/lib/coursemap/catalogue-section-review-actions";
import { catalogueVersion } from "@/lib/coursemap/catalogue-version";
import { loadCourseWorkspaceEntry } from "@/lib/coursemap/course-workspace-entry";
import { loadCourseImportTargetDetail } from "@/lib/coursemap/admin-course-imports";
import { courseImportQueuesEnabled } from "@/lib/course-import/queue";
import { notFound } from "next/navigation";
import { CourseReview } from "./course-review";
import { canManageCourseImports, canWriteCourses } from "@/lib/auth/viewer";
import { loadAdminCourseYear } from "@/lib/coursemap/admin-course-year";
import { toStudentPreviewCourseYear } from "@/lib/coursemap/admin-course-preview";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import { loadPublishedCoursesByCodes } from "@/lib/coursemap/published-courses";
import { prerequisiteCodesFromSnapshotProjection } from "@/lib/coursemap/snapshot-prerequisite-codes";

export async function AdminCourseDetailPage({
  params,
  searchParams,
  pageView,
  versionPublicId,
}: {
  pageView?: "history" | "preview";
  versionPublicId?: string;
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    snapshot?: string | string[];
    view?: string;
    import?: string;
  }>;
}) {
  const [{ id }, query, canWrite, canViewImports] = await Promise.all([
    params,
    searchParams,
    canWriteCourses(),
    canManageCourseImports(),
  ]);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      id,
    ) ||
    "view" in query ||
    "snapshot" in query ||
    "year" in query
  )
    notFound();
  const workspace = await catalogueWorkspaceIdentity("course", id);
  if (!workspace) notFound();
  const requestedYear = workspace.year;
  const version = versionPublicId
    ? await catalogueVersion("course", versionPublicId)
    : null;
  if (versionPublicId && !version) notFound();
  const requestedSnapshotValue = version?.id;
  const requestedSnapshotId =
    requestedSnapshotValue !== undefined &&
    Number.isSafeInteger(requestedSnapshotValue)
      ? requestedSnapshotValue
      : undefined;
  if (requestedYear === undefined) notFound();
  const [loadedRecord, entry] = await Promise.all([
    loadAdminCourseYear(
      workspace.identityId,
      requestedYear,
      false,
      requestedSnapshotId,
    ),
    loadCourseWorkspaceEntry(
      workspace.identityId,
      requestedYear,
      canViewImports,
    ),
  ]);
  const record = loadedRecord?.year === requestedYear ? loadedRecord : null;
  if (!entry) notFound();
  if (
    requestedSnapshotId !== undefined &&
    record?.currentSnapshotId !== requestedSnapshotId
  )
    notFound();
  const view = pageView ?? "review";
  const selectedImport =
    (["imports", "history"].includes(view)
      ? entry.imports.find((item) => item.id === query.import)
      : null) ?? entry.imports[0];
  const importDetail =
    canViewImports && ["imports", "history"].includes(view) && selectedImport
      ? await loadCourseImportTargetDetail({
          targetId: selectedImport.id,
          includeProjections: false,
        })
      : null;

  const referenced =
    view === "preview"
      ? [
          ...new Set(
            record?.projection
              ? prerequisiteCodesFromSnapshotProjection(record?.projection)
              : [],
          ),
        ].filter((code) => code !== entry.code)
      : [];
  let publishedPrerequisites: CourseDetails[] = [];
  try {
    publishedPrerequisites = await loadPublishedCoursesByCodes(
      referenced,
      entry.year,
    );
  } catch {
    publishedPrerequisites = [];
  }

  return (
    <CourseReview
      key={`${entry.code}:${entry.year}`}
      canWrite={canWrite}
      canReviewImports={canViewImports}
      previewCourse={
        record
          ? toStudentPreviewCourseYear(record, publishedPrerequisites)
          : null
      }
      reviewHistory={
        view === "history" && record
          ? await loadCatalogueReviewHistory("course", record.courseYearId)
          : []
      }
      sectionReviews={
        record?.currentSnapshotId && canWrite
          ? await loadCatalogueSectionReview(
              "course",
              record.courseYearId,
              record.currentSnapshotId,
            )
          : []
      }
      record={record ? { ...record, publicId: id } : null}
      entry={{ ...entry, publicId: id }}
      importDetail={importDetail}
      canImport={
        canViewImports && entry.importEnabled && courseImportQueuesEnabled()
      }
    />
  );
}
