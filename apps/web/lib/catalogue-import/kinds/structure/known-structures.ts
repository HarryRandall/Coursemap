import type { SyncSql } from "../../../catalogue-sync/sync-store.ts";
import type { AcademicStructureKind } from "./contract.ts";

export type KnownStructure = {
  code: string;
  name: string;
  kind: AcademicStructureKind;
};

/** Exact, year-specific identities from the imported ANU directory. */
export async function loadKnownStructures(
  sql: SyncSql,
  academicYearId: number,
): Promise<KnownStructure[]> {
  const rows = await sql`
    select codes.code, listings.title as name, listings.kind
    from public.catalogue_listings listings
    join public.catalogue_codes codes on codes.id = listings.code_id
    where listings.academic_year_id = ${academicYearId}
      and listings.kind in ('programme', 'major', 'minor', 'specialisation')
      and listings.is_current and listings.source_page_id is not null
      and listings.title is not null and btrim(listings.title) <> ''
    order by codes.code
  `;
  return rows.map((row) => ({
    code: String(row.code),
    name: String(row.name),
    kind: row.kind as AcademicStructureKind,
  }));
}

export function structureForName(
  name: string,
  kind: AcademicStructureKind,
  structures: readonly KnownStructure[],
) {
  const normalise = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  const matches = structures.filter(
    (item) => item.kind === kind && normalise(item.name) === normalise(name),
  );
  return new Set(matches.map((item) => item.code)).size === 1
    ? matches[0]
    : undefined;
}
