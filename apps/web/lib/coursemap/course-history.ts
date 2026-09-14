import type { AdminCourseSnapshotOption } from "./admin-course-year";
import type { CourseWorkspaceImport } from "./course-workspace-entry";

export function courseImportEventTitle(item: CourseWorkspaceImport) {
  if (item.processing_status === "failed") return "Import failed";
  if (item.processing_status === "cancelled") return "Import cancelled";
  if (item.processing_status === "queued") return "Import queued";
  if (["processing", "running"].includes(item.processing_status))
    return "Import in progress";
  if (item.review_status === "rejected") return "Import rejected";
  if (
    item.processing_status === "unchanged" ||
    item.review_status === "unchanged"
  )
    return "Import checked, no changes";
  return "Imported from ANU";
}

/** An import and its resulting version are one event in the course history. */
export function courseHistoryEvents(
  imports: CourseWorkspaceImport[],
  versions: AdminCourseSnapshotOption[],
) {
  const linked = new Set(imports.map((item) => item.candidate_snapshot_id));
  return [
    ...imports.map((item) => ({
      id: `import:${item.id}`,
      createdAt: item.created_at,
      title: courseImportEventTitle(item),
      imported: item as CourseWorkspaceImport | null,
      version:
        versions.find((version) => version.id === item.candidate_snapshot_id) ??
        null,
    })),
    ...versions
      .filter((version) => !linked.has(version.id))
      .map((version) => ({
        id: `version:${version.id}`,
        createdAt: version.createdAt,
        title:
          version.origin === "import" ? "Imported from ANU" : "Draft edited",
        imported: null as CourseWorkspaceImport | null,
        version,
      })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
