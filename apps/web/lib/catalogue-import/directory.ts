import { fetchAnuAcademicStructureDirectory } from "./anu-academic-structure-directory.ts";
import { fetchAnuCourseDirectory } from "./anu-course-directory.ts";
import type { ImportDiagnostic } from "./import-source.ts";
import {
  ensureAnuSourceId,
  recordSourcePage,
  type ImportSql,
  type ImportTransactionSql,
  withImportDatabaseClient,
} from "./import-store.ts";
import type { AcademicStructureKind } from "./kinds/structure/contract.ts";
import { type CatalogueKind, isCatalogueKind } from "../catalogue/content.ts";

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
  sourcePageExternalKey?: string;
};

type DirectorySourcePageInput = {
  externalKey: string;
  sourceUrl: string;
  mediaType: string;
  contentSha256: string;
  byteSize: number;
  httpStatus: number;
  httpEtag: string | null;
  sourceLastModified: string | null;
  fetchedAt: string;
};

async function fetchDirectoryEntries(
  kind: CatalogueKind,
  academicYear: number,
  signal?: AbortSignal,
): Promise<{
  entries: DirectoryEntryInput[];
  sourcePages: DirectorySourcePageInput[];
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
        sourcePageExternalKey: directory.sourcePage.externalKey,
      })),
      sourcePages: [directory.sourcePage],
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
      sourcePageExternalKey: entry.sourcePageExternalKey,
    })),
    sourcePages: directory.sourcePages,
    isComplete: directory.isComplete,
    diagnostics: directory.diagnostics,
  };
}

export async function reconcileCatalogueListings(
  tx: ImportTransactionSql,
  {
    academicYearId,
    kind,
    entries,
    isComplete,
    sourcePageIds = new Map(),
  }: {
    academicYearId: number;
    kind: CatalogueKind;
    entries: DirectoryEntryInput[];
    isComplete: boolean;
    sourcePageIds?: ReadonlyMap<string, number>;
  },
) {
  let added = 0;
  let updated = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    const code = entry.code.trim().toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    const [catalogueCode] = await tx`
      insert into public.catalogue_codes (kind, code)
      values (${kind}, ${code})
      on conflict (kind, code) do update set code = excluded.code
      returning id
    `;
    const [record] = await tx`
      insert into public.catalogue_records (code_id, kind, academic_year_id)
      values (${catalogueCode.id}, ${kind}, ${academicYearId})
      on conflict (code_id, academic_year_id) do update set kind = excluded.kind
      returning id
    `;
    const [row] = await tx`
      insert into public.catalogue_listings (
        academic_year_id, kind, code, code_id, record_id, source_page_id,
        title, summary, is_current, last_seen_at
      ) values (
        ${academicYearId}, ${kind}, ${code}, ${catalogueCode.id}, ${record.id},
        ${entry.sourcePageExternalKey ? (sourcePageIds.get(entry.sourcePageExternalKey) ?? null) : null},
        ${entry.title}, ${tx.json(JSON.parse(JSON.stringify(entry.summary)))}, true, now()
      )
      on conflict (academic_year_id, kind, code) do update
      set code_id = excluded.code_id,
          record_id = excluded.record_id,
          source_page_id = excluded.source_page_id,
          title = excluded.title,
          summary = excluded.summary,
          is_current = true,
          last_seen_at = now()
      returning (xmax = 0) as inserted
    `;
    if (row.inserted) added += 1;
    else updated += 1;
  }
  const retiredRows = isComplete
    ? seen.size
      ? await tx`
        update public.catalogue_listings
        set is_current = false
        where academic_year_id = ${academicYearId}
          and kind = ${kind}
          and is_current
          and code <> all(${tx.array([...seen])}::text[])
        returning id
      `
      : await tx`
          update public.catalogue_listings
          set is_current = false
          where academic_year_id = ${academicYearId}
            and kind = ${kind}
            and is_current
          returning id
        `
    : [];
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
    insert into public.catalogue_discovery_statuses (academic_year_id, kind, status, entry_count, refreshed_at, message)
    values (
      ${academicYearId}, ${kind}, ${status}, ${entryCount ?? 0},
      ${status === "available" ? sql`now()` : sql`null`}, ${message}
    )
    on conflict (academic_year_id, kind) do update
    set status = excluded.status,
        entry_count = case when excluded.status = 'available' then excluded.entry_count else public.catalogue_discovery_statuses.entry_count end,
        refreshed_at = case when excluded.status = 'available' then now() else public.catalogue_discovery_statuses.refreshed_at end,
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
    const [check] = await sql`
      insert into public.catalogue_discovery_checks (
        academic_year_id, kind, status
      ) values (${academicYearId}, ${kind}, 'running')
      returning id
    `;
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
      const sourceId = await ensureAnuSourceId(sql);
      const sourcePageIds = new Map<string, number>();
      for (const page of fetched.sourcePages) {
        const sourcePageId = await recordSourcePage(sql, {
          sourceId,
          academicYearId,
          kind: "directory",
          externalKey: page.externalKey,
          canonicalUrl: page.sourceUrl,
          mediaType: page.mediaType,
          contentSha256: page.contentSha256,
          httpStatus: page.httpStatus,
          httpEtag: page.httpEtag,
          sourceLastModified: page.sourceLastModified,
          fetchedAt: page.fetchedAt,
          byteSize: page.byteSize,
          storageBucket: null,
          storagePath: null,
        });
        sourcePageIds.set(page.externalKey, sourcePageId);
        await sql`
          insert into public.catalogue_discovery_check_source_pages (
            discovery_check_id, source_page_id
          ) values (${check.id}, ${sourcePageId})
          on conflict do nothing
        `;
      }
      onProgress?.({
        phase: "saving",
        message: `Saving ${fetched.entries.length} entries.`,
        received: fetched.entries.length,
      });
      const counts = await sql.begin((tx) =>
        reconcileCatalogueListings(tx, {
          academicYearId,
          kind,
          entries: fetched.entries,
          isComplete: fetched.isComplete,
          sourcePageIds,
        }),
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
      await sql`
        update public.catalogue_discovery_checks
        set status = 'completed', is_complete = ${fetched.isComplete},
            discovered_count = ${entryCount},
            source_page_id = ${fetched.sourcePages[0] ? (sourcePageIds.get(fetched.sourcePages[0].externalKey) ?? null) : null},
            completed_at = now()
        where id = ${check.id}
      `;
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
      await sql`
        update public.catalogue_discovery_checks
        set status = 'failed', error_code = 'DISCOVERY_FAILED',
            error_message = ${error instanceof Error ? error.message.slice(0, 500) : "The discovery failed."},
            completed_at = now()
        where id = ${check.id}
      `;
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
