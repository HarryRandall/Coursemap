import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { emptyCatalogueContent } from "@/lib/catalogue/content";
import { contentHashForCatalogueContent } from "@/lib/catalogue-import/version-content";
import { createClient } from "@/lib/supabase/server";
import type {
  CatalogueDirectoryPage,
  CatalogueDirectoryRecord,
  CatalogueKind,
} from "./catalogue-kinds";

export * from "./catalogue-kinds";

const PAGE_SIZE = 50;
const ROW_PAGE_SIZE = 1000;

async function readAllRows<Row>(
  readPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Row[] | null;
    error: PostgrestError | null;
  }>,
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += ROW_PAGE_SIZE) {
    const { data, error } = await readPage(from, from + ROW_PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < ROW_PAGE_SIZE) return { data: rows, error: null };
  }
}

export async function loadCatalogueYears() {
  const supabase = await createClient();
  const [years, statuses] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id,year")
      .gte("year", 2020)
      .lte("year", 2030),
    supabase.from("catalogue_discovery_statuses").select("academic_year_id"),
  ]);
  if (years.error) throw years.error;
  if (statuses.error) throw statuses.error;
  const current = new Date().getFullYear();
  const fetched = new Set(
    (statuses.data ?? []).map((row) => row.academic_year_id),
  );
  return (years.data ?? [])
    .filter(
      (row) =>
        fetched.has(row.id) || row.year === current || row.year === current + 1,
    )
    .map((row) => row.year)
    .sort((left, right) => right - left);
}

export async function defaultCatalogueYear(
  kind: CatalogueKind,
  years: number[],
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalogue_records")
    .select("academic_years(year)")
    .eq("kind", kind)
    .order("academic_year_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const available = data?.academic_years?.year;
  if (available && years.includes(available)) return available;
  const current = new Date().getFullYear();
  return years.includes(current) ? current : (years[0] ?? current);
}

export async function loadCatalogueDirectoryPage({
  kind,
  academicYear,
  query = "",
  page = 1,
}: {
  kind: CatalogueKind;
  academicYear: number;
  query?: string;
  page?: number;
}): Promise<CatalogueDirectoryPage> {
  const supabase = await createClient();
  const years = await loadCatalogueYears();
  const { data: year } = await supabase
    .from("academic_years")
    .select("id")
    .eq("year", academicYear)
    .maybeSingle();
  const empty: CatalogueDirectoryPage = {
    kind,
    academicYear,
    years,
    status: { state: "never", refreshedAt: null, message: null, entryCount: 0 },
    records: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
  };
  if (!year) return empty;

  const [status, listings, records] = await Promise.all([
    supabase
      .from("catalogue_discovery_statuses")
      .select("status,refreshed_at,message,entry_count")
      .eq("academic_year_id", year.id)
      .eq("kind", kind)
      .maybeSingle(),
    readAllRows((from, to) =>
      supabase
        .from("catalogue_listings")
        .select("code,title,summary,code_id,is_current,last_seen_at")
        .eq("academic_year_id", year.id)
        .eq("kind", kind)
        .order("code")
        .range(from, to),
    ),
    readAllRows((from, to) =>
      supabase
        .from("catalogue_records")
        .select("id,code_id,published_version_id,archived_at")
        .eq("academic_year_id", year.id)
        .eq("kind", kind)
        .order("code_id")
        .range(from, to),
    ),
  ]);
  if (status.error) throw status.error;
  if (listings.error) throw listings.error;
  if (records.error) throw records.error;

  // These select by the record's year and kind rather than by a list of record
  // identifiers. A year holds thousands of records, and naming each one puts
  // the whole list in the query string, which the database gateway rejects as
  // a URI too long once a directory has been discovered in full.
  const [drafts, syncs, openChanges] = await Promise.all([
    readAllRows((from, to) =>
      supabase
        .from("catalogue_drafts")
        .select(
          "record_id,content_hash,revision,catalogue_records!inner(academic_year_id,kind)",
        )
        .eq("catalogue_records.academic_year_id", year.id)
        .eq("catalogue_records.kind", kind)
        .order("record_id")
        .range(from, to),
    ),
    readAllRows((from, to) =>
      supabase
        .from("catalogue_syncs")
        .select(
          "id,record_id,status,error_message,completed_at,created_at,catalogue_records!inner(academic_year_id,kind)",
        )
        .eq("catalogue_records.academic_year_id", year.id)
        .eq("catalogue_records.kind", kind)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    readAllRows((from, to) =>
      supabase
        .from("catalogue_sync_changes")
        .select(
          "record_id,classification,catalogue_records!inner(academic_year_id,kind)",
        )
        .eq("catalogue_records.academic_year_id", year.id)
        .eq("catalogue_records.kind", kind)
        .in("classification", ["source_change", "conflict"])
        .is("decision", null)
        .is("superseded_at", null)
        .order("record_id")
        .range(from, to),
    ),
  ]);
  if (drafts.error) throw drafts.error;
  if (syncs.error) throw syncs.error;
  if (openChanges.error) throw openChanges.error;
  const openChangeCounts = new Map<
    number,
    { open: number; conflicts: number }
  >();
  for (const change of openChanges.data ?? []) {
    const counts = openChangeCounts.get(change.record_id) ?? {
      open: 0,
      conflicts: 0,
    };
    counts.open += 1;
    if (change.classification === "conflict") counts.conflicts += 1;
    openChangeCounts.set(change.record_id, counts);
  }
  const recordByCodeId = new Map(
    records.data.map((record) => [record.code_id, record]),
  );
  // A draft row is only worth reporting when it says something the record did
  // not already say. Comparing hashes keeps a draft that was restored from the
  // publication, or edited back to match it, out of the Draft state.
  const draftRows = new Map(
    (drafts.data ?? []).map((draft) => [draft.record_id, draft]),
  );
  const draftedPublishedVersionIds = records.data.flatMap((record) =>
    draftRows.has(record.id) && record.published_version_id
      ? [record.published_version_id]
      : [],
  );
  // Named by identifier rather than filtered by year, because only records
  // that carry a draft reach this list and that is a handful, not thousands.
  const { data: publishedVersions } = draftedPublishedVersionIds.length
    ? await supabase
        .from("catalogue_versions")
        .select("id,content_hash")
        .in("id", draftedPublishedVersionIds)
    : { data: [] as Array<{ id: number; content_hash: string }> };
  const publishedHashes = new Map(
    (publishedVersions ?? []).map((version) => [
      version.id,
      version.content_hash,
    ]),
  );
  const latestSync = new Map<number, (typeof syncs.data)[number]>();
  for (const sync of syncs.data ?? [])
    if (!latestSync.has(sync.record_id)) latestSync.set(sync.record_id, sync);
  const listedIds = new Set(
    listings.data.flatMap((listing) =>
      listing.code_id ? [listing.code_id] : [],
    ),
  );
  const extraIds = records.data
    .map((record) => record.code_id)
    .filter((id) => !listedIds.has(id));
  const { data: extraCodes } = extraIds.length
    ? await supabase
        .from("catalogue_codes")
        .select("id,code")
        .in("id", extraIds)
    : { data: [] as Array<{ id: number; code: string }> };

  const rows = [
    ...listings.data.map((listing) => ({
      ...listing,
      itemId: listing.code_id,
    })),
    ...(extraCodes ?? []).map((code) => ({
      code: code.code,
      title: null,
      summary: {},
      itemId: code.id,
      is_current: null,
      last_seen_at: null,
    })),
  ].map((listing) => {
    const record = listing.itemId
      ? recordByCodeId.get(listing.itemId)
      : undefined;
    const sync = record ? latestSync.get(record.id) : undefined;
    const draftRow = record ? draftRows.get(record.id) : undefined;
    // What the draft would have started as. An unpublished record starts
    // empty, so a draft holding nothing is not a draft anyone has to act on.
    const baseHash = !draftRow
      ? null
      : record?.published_version_id
        ? publishedHashes.get(record.published_version_id)
        : contentHashForCatalogueContent(
            emptyCatalogueContent({
              kind,
              code: listing.code,
              academicYear,
              title: listing.title,
            }),
          );
    const hasDraft =
      draftRow !== undefined && draftRow.content_hash !== baseHash;
    const isPublished = Boolean(
      record?.published_version_id && !record.archived_at,
    );
    const counts = record
      ? (openChangeCounts.get(record.id) ?? { open: 0, conflicts: 0 })
      : { open: 0, conflicts: 0 };
    const sourceState: CatalogueDirectoryRecord["sourceState"] = !sync
      ? "never_synced"
      : sync.status === "queued" || sync.status === "running"
        ? "syncing"
        : sync.status === "failed"
          ? "sync_failed"
          : counts.open > 0
            ? "changes_available"
            : "up_to_date";
    return {
      code: listing.code,
      title: listing.title,
      summary: (listing.summary ?? {}) as Record<string, unknown>,
      recordId: record?.id ?? null,
      hasDraft,
      draftRevision: hasDraft ? (draftRow?.revision ?? null) : null,
      isPublished,
      isListedByAnu: listing.is_current,
      lastSeenAt: listing.last_seen_at,
      sourceState,
      openChangeCount: counts.open,
      conflictCount: counts.conflicts,
      latestSync: sync
        ? {
            id: sync.id,
            status: sync.status,
            errorMessage: sync.error_message,
            completedAt: sync.completed_at,
          }
        : null,
    } satisfies CatalogueDirectoryRecord;
  });
  const needle = query.trim().toUpperCase();
  const filtered = rows
    .filter(
      (row) =>
        !needle ||
        row.code.includes(needle) ||
        (row.title ?? "").toUpperCase().includes(needle),
    )
    .sort((left, right) => left.code.localeCompare(right.code));
  const safePage = Math.max(
    1,
    Math.min(page, Math.ceil(filtered.length / PAGE_SIZE) || 1),
  );
  const start = (safePage - 1) * PAGE_SIZE;
  return {
    kind,
    academicYear,
    years,
    status: {
      state:
        (status.data?.status as CatalogueDirectoryPage["status"]["state"]) ??
        "never",
      refreshedAt: status.data?.refreshed_at ?? null,
      message: status.data?.message ?? null,
      entryCount: status.data?.entry_count ?? 0,
    },
    records: filtered.slice(start, start + PAGE_SIZE),
    total: filtered.length,
    page: safePage,
    pageSize: PAGE_SIZE,
  };
}
