import { catalogueIdentities } from "@/lib/coursemap/catalogue-identities";
import { ImportsList } from "@/ui/admin/imports/imports-list";
import {
  parseImportListSearchParams,
  type ImportListSearchParams,
} from "@/lib/coursemap/import-list-params";
import {
  loadAcademicStructureImportPage,
  type AcademicStructureImportKind,
} from "@/lib/coursemap/admin-academic-structure-imports";

/** Each kind keeps its imports under the directory it belongs to. */
export const academicStructureBasePaths: Record<
  AcademicStructureImportKind,
  string
> = {
  programme: "/admin/programmes",
  major: "/admin/majors",
  minor: "/admin/minors",
  specialisation: "/admin/specialisations",
};

const headings: Record<AcademicStructureImportKind, string> = {
  programme: "Programme imports",
  major: "Major imports",
  minor: "Minor imports",
  specialisation: "Specialisation imports",
};

const plurals: Record<AcademicStructureImportKind, string> = {
  programme: "programmes",
  major: "majors",
  minor: "minors",
  specialisation: "specialisations",
};

export async function AcademicStructureImportsPage({
  kind,
  searchParams,
}: {
  kind: AcademicStructureImportKind;
  searchParams: Promise<ImportListSearchParams>;
}) {
  const parsed = parseImportListSearchParams(await searchParams);
  const data = await loadAcademicStructureImportPage({
    structureKind: kind,
    page: parsed.page,
    query: parsed.query,
    sort: parsed.sort,
    status: parsed.status,
    statusNegated: parsed.statusNegated,
  });

  const identities = await catalogueIdentities(
    kind,
    data.records.map((record) => record.structureCode),
  );

  return (
    <ImportsList
      basePath={academicStructureBasePaths[kind]}
      data={{
        records: data.records.map((record) => ({
          id: record.id,
          publicId:
            identities.get(`${record.structureCode}:${record.academicYear}`) ??
            null,
          code: record.structureCode,
          title: record.structureTitle,
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
      heading={headings[kind]}
      itemName="imports"
      noun={kind}
      plural={plurals[kind]}
      searchParams={parsed.searchParams}
      sort={parsed.sort}
      system="structure"
    />
  );
}
