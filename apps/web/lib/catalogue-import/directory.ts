import { fetchAnuAcademicStructureDirectory } from "./anu-academic-structure-directory.ts";
import { fetchAnuCourseDirectory } from "./anu-course-directory.ts";
import type { ImportDiagnostic } from "./import-source.ts";
import {
  type ImportSql,
  type ImportTransactionSql,
  withImportDatabaseClient,
} from "./import-store.ts";
import type { AcademicStructureKind } from "./kinds/structure/contract.ts";
import { type CatalogueKind, isCatalogueKind } from "./snapshot-write.ts";

export type DirectoryRefreshProgress = {
  phase: "fetching" | "saving" | "done";
  message: string;
  received?: number;
};

export type DirectoryRefreshResult = {
  academicYear: number;
  kind: CatalogueKind;
  entryCount: number;
  added: number;
  updated: number;
  retired: number;
  isComplete: boolean;
  diagnostics: ImportDiagnostic[];
};

export class DirectoryRefreshError extends Error {
  readonly code: string;

  constructor(message: string, code = "DIRECTORY_REFRESH_FAILED") {
    super(message);
    this.name = "DirectoryRefreshError";
    this.code = code;
  }
}

type DirectoryEntryInput = {
  code: string;
  title: string | null;
  summary: Record<string, unknown>;
};

async function fetchDirectoryEntries(
  kind: CatalogueKind,
  academicYear: number,
  signal?: AbortSignal,
): Promise<{
  entries: DirectoryEntryInput[];
  isComplete: boolean;
  diagnostics: ImportDiagnostic[];
}> {
  if (kind === "course") {
    const directory = await fetchAnuCourseDirectory(academicYear, { signal });
    return {
      entries: directory.entries.map((entry) => ({
        code: entry.code,
        title: entry.name,
        summary: {
          career: entry.career,
          session: entry.session,
          units: entry.units,
          modeOfDelivery: entry.modeOfDelivery,
        },
      })),
      isComplete: directory.isComplete,
      diagnostics: directory.diagnostics,
    };
  }
  const directory = await fetchAnuAcademicStructureDirectory(
    kind as AcademicStructureKind,
    academicYear,
    { signal },
  );
  return {
    entries: directory.entries.map((entry) => ({
      code: entry.code,
      title: entry.title,
      summary: {
        shortTitle: entry.shortTitle,
        career: entry.academicCareer,
        durationYears: entry.durationYears,
        units: entry.units,
        modeOfDelivery: entry.modeOfDelivery,
        selectionRank: entry.selectionRank,
      },
    })),
    isComplete: directory.isComplete,
    diagnostics: directory.diagnostics,
  };
}

async function saveDirectory(
  tx: ImportTransactionSql,
  {
    academicYearId,
    kind,
    entries,
  }: {
    academicYearId: number;
    kind: CatalogueKind;
    entries: DirectoryEntryInput[];
  },
) {
  let added = 0;
  let updated = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    const code = entry.code.trim().toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    const [row] = await tx`
      insert into public.catalogue_directory_entries (
        academic_year_id, kind, code, title, summary, is_current, last_seen_at
      ) values (
        ${academicYearId}, ${kind}, ${code}, ${entry.title}, ${tx.json(JSON.parse(JSON.stringify(entry.summary)))}, true, now()
      )
      on conflict (academic_year_id, kind, code) do update
      set title = excluded.title,
          summary = excluded.summary,
          is_current = true,
          last_seen_at = now()
      returning (xmax = 0) as inserted
    `;
    if (row.inserted) added += 1;
    else updated += 1;
  }
  const retiredRows = seen.size
    ? await tx`
        update public.catalogue_directory_entries
        set is_current = false
        where academic_year_id = ${academicYearId}
          and kind = ${kind}
          and is_current
          and code <> all(${tx.array([...seen])}::text[])
        returning id
      `
    : [];
  // Entries that already have an identity keep it linked.
  await tx`
    update public.catalogue_directory_entries as entries
    set item_id = items.id
    from public.catalogue_items as items
    where entries.academic_year_id = ${academicYearId}
      and entries.kind = ${kind}
      and entries.item_id is null
      and items.kind = entries.kind
      and items.code = entries.code
  `;
  return { added, updated, retired: retiredRows.length };
}

async function setDirectoryStatus(
  sql: ImportSql | ImportTransactionSql,
  {
    academicYearId,
    kind,
    status,
    entryCount,
    message,
  }: {
    academicYearId: number;
    kind: CatalogueKind;
    status: "refreshing" | "available" | "failed";
    entryCount?: number;
    message: string | null;
  },
) {
  await sql`
    insert into public.catalogue_directory_statuses (academic_year_id, kind, status, entry_count, refreshed_at, message)
    values (
      ${academicYearId}, ${kind}, ${status}, ${entryCount ?? 0},
      ${status === "available" ? sql`now()` : sql`null`}, ${message}
    )
    on conflict (academic_year_id, kind) do update
    set status = excluded.status,
        entry_count = case when excluded.status = 'available' then excluded.entry_count else public.catalogue_directory_statuses.entry_count end,
        refreshed_at = case when excluded.status = 'available' then now() else public.catalogue_directory_statuses.refreshed_at end,
        message = excluded.message
  `;
}

/**
 * Fetches the ANU listing for one kind and year and reconciles the directory.
 * Entries missing from a complete listing are marked not current rather than
 * deleted, so identities and import history keep their references.
 */
export async function refreshCatalogueDirectory({
  kind,
  academicYear,
  onProgress,
  signal,
}: {
  kind: CatalogueKind;
  academicYear: number;
  onProgress?: (progress: DirectoryRefreshProgress) => void;
  signal?: AbortSignal;
}): Promise<DirectoryRefreshResult> {
  if (!isCatalogueKind(kind)) {
    throw new DirectoryRefreshError(
      "The catalogue kind is not recognised.",
      "INVALID_KIND",
    );
  }
  if (
    !Number.isInteger(academicYear) ||
    academicYear < 2020 ||
    academicYear > 2030
  ) {
    throw new DirectoryRefreshError(
      "Directory refreshes support academic years 2020 to 2030.",
      "INVALID_YEAR",
    );
  }
  return withImportDatabaseClient(async (sql) => {
    const [year] = await sql`
      select id from public.academic_years where year = ${academicYear}
    `;
    if (!year) {
      throw new DirectoryRefreshError(
        "The academic year is not registered.",
        "UNKNOWN_YEAR",
      );
    }
    const academicYearId = Number(year.id);
    await setDirectoryStatus(sql, {
      academicYearId,
      kind,
      status: "refreshing",
      message: null,
    });
    try {
      onProgress?.({
        phase: "fetching",
        message: `Fetching the ${kind} listing for ${academicYear}.`,
      });
      const fetched = await fetchDirectoryEntries(kind, academicYear, signal);
      onProgress?.({
        phase: "saving",
        message: `Saving ${fetched.entries.length} entries.`,
        received: fetched.entries.length,
      });
      const counts = await sql.begin((tx) =>
        saveDirectory(tx, { academicYearId, kind, entries: fetched.entries }),
      );
      const entryCount = fetched.entries.length;
      const warnings = fetched.diagnostics.filter(
        (item) => item.severity === "error",
      );
      await setDirectoryStatus(sql, {
        academicYearId,
        kind,
        status: "available",
        entryCount,
        message: fetched.isComplete
          ? warnings.length
            ? `${warnings.length} listing issue${warnings.length === 1 ? "" : "s"} recorded.`
            : null
          : "The listing may be incomplete; retired entries were not updated.",
      });
      onProgress?.({
        phase: "done",
        message: `Directory refreshed with ${entryCount} entries.`,
      });
      return {
        academicYear,
        kind,
        entryCount,
        added: counts.added,
        updated: counts.updated,
        retired: fetched.isComplete ? counts.retired : 0,
        isComplete: fetched.isComplete,
        diagnostics: fetched.diagnostics,
      };
    } catch (error) {
      await setDirectoryStatus(sql, {
        academicYearId,
        kind,
        status: "failed",
        message:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "The refresh failed.",
      });
      throw error;
    }
  });
}
