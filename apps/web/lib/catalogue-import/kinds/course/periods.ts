import type { SyncSql } from "../../../catalogue-sync/sync-store.ts";

export type KnownAcademicPeriod = { code: string; name: string };

/** Calendar identities link imported classes to the student's planning periods. */
export async function loadKnownAcademicPeriods(
  sql: SyncSql,
  calendarYear: number,
): Promise<KnownAcademicPeriod[]> {
  const rows = await sql`
    select code, name from public.academic_periods
    where calendar_year = ${calendarYear}
    order by sort_order, code
  `;
  return rows.map((row) => ({
    code: String(row.code),
    name: String(row.name),
  }));
}
