import { notFound, redirect } from "next/navigation";
import type { CatalogueKind } from "@/lib/coursemap/catalogue-kinds";
import { adminCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import { CatalogueDirectoryPage, type SearchParams } from "./catalogue-pages";
import { CatalogueVersionPage } from "./changelog/version-page";
import { CatalogueRecordPage } from "./record-page";
import type { RecordSection } from "./record-tabs";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const RECORD_SECTIONS = new Set<RecordSection>([
  "content",
  "student-view",
  "changes",
  "changelog",
]);

export async function CatalogueYearRoute({
  kind,
  year,
  searchParams,
}: {
  kind: CatalogueKind;
  year: string;
  searchParams: SearchParams;
}) {
  const academicYear = Number(year);
  if (
    !Number.isInteger(academicYear) ||
    academicYear < 2020 ||
    academicYear > 2030
  )
    notFound();
  return (
    <CatalogueDirectoryPage
      kind={kind}
      academicYear={academicYear}
      searchParams={searchParams}
    />
  );
}

export async function CatalogueRecordRoute({
  kind,
  year,
  code,
  section,
  searchParams,
}: {
  kind: CatalogueKind;
  year: string;
  code: string;
  section?: string[];
  searchParams: SearchParams;
}) {
  const academicYear = Number(year);
  if (
    !Number.isInteger(academicYear) ||
    academicYear < 2020 ||
    academicYear > 2030
  )
    notFound();
  const canonicalPath = adminCatalogueRecordPath(kind, academicYear, code);
  if (code !== code.toLowerCase())
    redirect(
      section?.length ? `${canonicalPath}/${section.join("/")}` : canonicalPath,
    );
  const requested = section?.[0] ?? "content";
  if (!RECORD_SECTIONS.has(requested as RecordSection)) notFound();
  const params = await searchParams;
  if (requested === "changelog" && section?.length === 2) {
    const ordinal = Number(section[1]);
    if (!Number.isInteger(ordinal) || ordinal < 1) notFound();
    return (
      <CatalogueVersionPage
        kind={kind}
        academicYear={academicYear}
        code={code}
        versionOrdinal={ordinal}
        compare={first(params.compare) ?? null}
      />
    );
  }
  if ((section?.length ?? 0) > 1) notFound();
  return (
    <CatalogueRecordPage
      kind={kind}
      academicYear={academicYear}
      code={code}
      section={requested as RecordSection}
      changelogEvents={Number(first(params.events)) || undefined}
    />
  );
}
