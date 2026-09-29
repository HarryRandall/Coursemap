import type { SyncSql } from "../../../catalogue-sync/sync-store.ts";

export type KnownProgramme = { code: string; name: string };

/** Year-specific identities from ANU's directory, including unimported programmes. */
export async function loadKnownProgrammes(
  sql: SyncSql,
  academicYearId: number,
): Promise<KnownProgramme[]> {
  const rows = await sql`
    select codes.code, listings.title as name
    from public.catalogue_listings as listings
    join public.catalogue_codes as codes on codes.id = listings.code_id
    where listings.academic_year_id = ${academicYearId}
      and listings.kind = 'programme' and listings.is_current
      and listings.source_page_id is not null
      and listings.title is not null and btrim(listings.title) <> ''
    order by codes.code
  `;
  return rows.map((row) => ({
    code: String(row.code),
    name: String(row.name),
  }));
}

function programmeNameKey(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** An exact name must identify one code; similar titles are never guessed. */
export function programmeCodeForName(
  name: string,
  programmes: readonly KnownProgramme[],
) {
  const key = programmeNameKey(name);
  const codes = new Set(
    programmes
      .filter((programme) => programmeNameKey(programme.name) === key)
      .map((programme) => programme.code),
  );
  return codes.size === 1 ? [...codes][0] : undefined;
}

/** Only names mentioned on this page enter the prompt, with all ambiguous matches retained. */
export function programmesMentionedOnPage(
  pageMarkdown: string,
  programmes: readonly KnownProgramme[],
) {
  const page = programmeNameKey(pageMarkdown);
  return programmes.filter((programme) =>
    page.includes(programmeNameKey(programme.name)),
  );
}
