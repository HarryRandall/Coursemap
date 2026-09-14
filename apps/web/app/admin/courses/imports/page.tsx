import { catalogueIdentities } from "@/lib/coursemap/catalogue-identities";
import { ImportsList } from "@/ui/admin/imports/imports-list";
import { loadCourseImportPage } from "@/lib/coursemap/admin-course-imports";
import {
  parseImportListSearchParams,
  type ImportListSearchParams,
} from "@/lib/coursemap/import-list-params";

export const dynamic = "force-dynamic";

export default async function CourseImportsPage({
  searchParams,
}: {
  searchParams: Promise<ImportListSearchParams>;
}) {
  const parsed = parseImportListSearchParams(await searchParams);
  const data = await loadCourseImportPage({
    page: parsed.page,
    query: parsed.query,
    sort: parsed.sort,
    status: parsed.status,
    statusNegated: parsed.statusNegated,
  });

  const identities = await catalogueIdentities(
    "course",
    data.records.map((record) => record.courseCode),
  );

  return (
    <ImportsList
      basePath="/admin/courses"
      data={{
        records: data.records.map((record) => ({
          id: record.id,
          publicId:
            identities.get(`${record.courseCode}:${record.academicYear}`) ??
            null,
          code: record.courseCode,
          title: record.courseTitle,
          academicYear: record.academicYear,
          processingStatus: record.processingStatus,
          reviewStatus: record.reviewStatus,
          changeKind: record.changeKind,
          createdAt: record.createdAt,
        })),
        page: data.page,
        pageSize: data.pageSize,
        total: data.total,
      }}
      heading="Course imports"
      itemName="imports"
      noun="course"
      plural="courses"
      searchParams={parsed.searchParams}
      sort={parsed.sort}
      system="course"
    />
  );
}
