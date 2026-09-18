import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CatalogueKind } from "./catalogue-kinds";

export type ReviewEntry = {
  id: number;
  entryKind: "change" | "flag";
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  severity: "warning" | "error" | null;
  isBlocking: boolean;
  issueCode: string | null;
  summary: string | null;
  sourceLocator: string | null;
  sourceExcerpt: string | null;
  status: "open" | "accepted" | "rejected" | "acknowledged";
  resolutionNote: string | null;
  resolvedAt: string | null;
};

export type ReviewTarget = {
  id: string;
  runId: string;
  runNumber: number;
  status: string;
  changeKind: string | null;
  createdAt: string;
  completedAt: string | null;
  appliedAt: string | null;
  baselineSnapshotId: number | null;
  candidateSnapshotId: number | null;
  entries: ReviewEntry[];
};

export type CatalogueRecordSnapshot = {
  id: number;
  publicId: string;
  origin: string;
  createdAt: string;
  sealedAt: string | null;
  basedOnSnapshotId: number | null;
  importTargetId: string | null;
  contentHash: string;
};

export type CatalogueRecord = {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
  itemId: number;
  itemYearId: number;
  itemYearPublicId: string;
  title: string;
  draftSnapshotId: number | null;
  publishedSnapshotId: number | null;
  archivedAt: string | null;
  publishBlockers: string[];
  snapshots: CatalogueRecordSnapshot[];
  publications: Array<{
    snapshotId: number | null;
    publishedAt: string;
    publishedBy: string | null;
  }>;
  reviews: ReviewTarget[];
};

async function snapshotTitle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: CatalogueKind,
  snapshotId: number | null,
) {
  if (!snapshotId) return null;
  if (kind === "course") {
    const { data } = await supabase
      .from("course_snapshot_details")
      .select("title")
      .eq("snapshot_id", snapshotId)
      .maybeSingle();
    return data?.title ?? null;
  }
  const { data } = await supabase
    .from("structure_snapshot_details")
    .select("name")
    .eq("snapshot_id", snapshotId)
    .maybeSingle();
  return data?.name ?? null;
}

/** Everything the record page needs: pointers, history and every import review. */
export async function loadCatalogueRecord({
  kind,
  code,
  academicYear,
}: {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
}): Promise<CatalogueRecord | null> {
  const supabase = await createClient();
  const { data: itemYear, error } = await supabase
    .from("catalogue_item_years")
    .select(
      "id,public_id,item_id,draft_snapshot_id,published_snapshot_id,archived_at,catalogue_items!inner(code,kind),academic_years!inner(year)",
    )
    .eq("kind", kind)
    .eq("catalogue_items.code", code.toUpperCase())
    .eq("academic_years.year", academicYear)
    .maybeSingle();
  if (error) throw error;
  if (!itemYear) return null;

  const [
    snapshotsResult,
    publicationsResult,
    targetsResult,
    blockersResult,
    title,
  ] = await Promise.all([
    supabase
      .from("catalogue_snapshots")
      .select(
        "id,public_id,origin,created_at,sealed_at,based_on_snapshot_id,import_target_id,content_hash",
      )
      .eq("item_year_id", itemYear.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("catalogue_publications")
      .select("snapshot_id,published_at,published_by")
      .eq("item_year_id", itemYear.id)
      .order("published_at", { ascending: false }),
    supabase
      .from("catalogue_import_targets")
      .select(
        "id,run_id,status,change_kind,created_at,completed_at,applied_at,baseline_snapshot_id,candidate_snapshot_id,catalogue_import_runs!inner(run_number)",
      )
      .eq("item_year_id", itemYear.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("catalogue_publish_blockers", { p_item_year_id: itemYear.id }),
    snapshotTitle(
      supabase,
      kind,
      itemYear.draft_snapshot_id ?? itemYear.published_snapshot_id,
    ),
  ]);
  if (snapshotsResult.error) throw snapshotsResult.error;
  if (publicationsResult.error) throw publicationsResult.error;
  if (targetsResult.error) throw targetsResult.error;
  if (blockersResult.error) throw blockersResult.error;

  const targetIds = (targetsResult.data ?? []).map((target) => target.id);
  const { data: entries, error: entriesError } = targetIds.length
    ? await supabase
        .from("catalogue_import_changes")
        .select("*")
        .in("target_id", targetIds)
        .order("position")
    : { data: [], error: null };
  if (entriesError) throw entriesError;
  const entriesByTarget = new Map<string, ReviewEntry[]>();
  for (const entry of entries ?? []) {
    const list = entriesByTarget.get(entry.target_id) ?? [];
    list.push({
      id: entry.id,
      entryKind: entry.entry_kind as ReviewEntry["entryKind"],
      fieldPath: entry.field_path,
      oldValue: entry.old_value,
      newValue: entry.new_value,
      severity: entry.severity as ReviewEntry["severity"],
      isBlocking: entry.is_blocking,
      issueCode: entry.issue_code,
      summary: entry.summary,
      sourceLocator: entry.source_locator,
      sourceExcerpt: entry.source_excerpt,
      status: entry.status as ReviewEntry["status"],
      resolutionNote: entry.resolution_note,
      resolvedAt: entry.resolved_at,
    });
    entriesByTarget.set(entry.target_id, list);
  }

  return {
    kind,
    code: itemYear.catalogue_items.code,
    academicYear,
    itemId: itemYear.item_id,
    itemYearId: itemYear.id,
    itemYearPublicId: itemYear.public_id,
    title: title ?? itemYear.catalogue_items.code,
    draftSnapshotId: itemYear.draft_snapshot_id,
    publishedSnapshotId: itemYear.published_snapshot_id,
    archivedAt: itemYear.archived_at,
    publishBlockers: (blockersResult.data as string[] | null) ?? [],
    snapshots: (snapshotsResult.data ?? []).map((snapshot) => ({
      id: snapshot.id,
      publicId: snapshot.public_id,
      origin: snapshot.origin,
      createdAt: snapshot.created_at,
      sealedAt: snapshot.sealed_at,
      basedOnSnapshotId: snapshot.based_on_snapshot_id,
      importTargetId: snapshot.import_target_id,
      contentHash: snapshot.content_hash,
    })),
    publications: (publicationsResult.data ?? []).map((publication) => ({
      snapshotId: publication.snapshot_id,
      publishedAt: publication.published_at,
      publishedBy: publication.published_by,
    })),
    reviews: (targetsResult.data ?? []).map((target) => ({
      id: target.id,
      runId: target.run_id,
      runNumber: target.catalogue_import_runs.run_number,
      status: target.status,
      changeKind: target.change_kind,
      createdAt: target.created_at,
      completedAt: target.completed_at,
      appliedAt: target.applied_at,
      baselineSnapshotId: target.baseline_snapshot_id,
      candidateSnapshotId: target.candidate_snapshot_id,
      entries: entriesByTarget.get(target.id) ?? [],
    })),
  };
}
