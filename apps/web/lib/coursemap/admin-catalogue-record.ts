import "server-only";
import { withImportDatabaseClient } from "@/lib/catalogue-import/import-store";
import { readVersionContent } from "@/lib/catalogue-import/version-content";
import type { CatalogueContent } from "@/lib/catalogue/content";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { CatalogueKind } from "./catalogue-kinds";
import { courseFromSnapshotProjection } from "./published-courses";

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
  baselineVersionId: number | null;
  candidateVersionId: number | null;
  entries: ReviewEntry[];
};

export type CatalogueVersion = {
  id: number;
  publicId: string;
  origin: string;
  createdAt: string;
  sealedAt: string | null;
  basedOnVersionId: number | null;
  importTargetId: string | null;
  contentHash: string;
};

export type CatalogueRecord = {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
  codeId: number;
  recordId: number;
  recordPublicId: string;
  title: string;
  currentVersionId: number | null;
  publishedVersionId: number | null;
  archivedAt: string | null;
  isListedByAnu: boolean | null;
  listingTitle: string | null;
  lastSeenAt: string | null;
  publishBlockers: string[];
  versions: CatalogueVersion[];
  publications: Array<{
    versionId: number;
    publishedAt: string;
    publishedBy: string | null;
    unpublishedAt: string | null;
    unpublishedBy: string | null;
  }>;
  changeEvents: Array<{
    id: number;
    eventKind: "edit" | "publish" | "unpublish" | "discard" | "restore";
    draftRevision: number | null;
    editingSessionId: string | null;
    versionId: number | null;
    createdAt: string;
  }>;
  reviews: ReviewTarget[];
};

async function versionTitle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: CatalogueKind,
  versionId: number | null,
) {
  if (!versionId) return null;
  if (kind === "course") {
    const { data } = await supabase
      .from("course_version_details")
      .select("title")
      .eq("version_id", versionId)
      .maybeSingle();
    return data?.title ?? null;
  }
  const { data } = await supabase
    .from("structure_version_details")
    .select("name")
    .eq("version_id", versionId)
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
    .from("catalogue_records")
    .select(
      "id,public_id,code_id,published_version_id,archived_at,catalogue_codes!inner(code,kind),academic_years!inner(year)",
    )
    .eq("kind", kind)
    .eq("catalogue_codes.code", code.toUpperCase())
    .eq("academic_years.year", academicYear)
    .maybeSingle();
  if (error) throw error;
  if (!itemYear) return null;

  const [
    versionsResult,
    publicationsResult,
    targetsResult,
    blockersResult,
    listingResult,
    changeEventsResult,
  ] = await Promise.all([
    supabase
      .from("catalogue_versions")
      .select(
        "id,public_id,origin,created_at,sealed_at,based_on_version_id,import_target_id,content_hash",
      )
      .eq("record_id", itemYear.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("catalogue_publications")
      .select(
        "version_id,published_at,published_by,unpublished_at,unpublished_by",
      )
      .eq("record_id", itemYear.id)
      .order("published_at", { ascending: false }),
    supabase
      .from("catalogue_import_targets")
      .select(
        "id,run_id,status,change_kind,created_at,completed_at,applied_at,applied_version_id,baseline_version_id,candidate_version_id,catalogue_import_runs!inner(run_number)",
      )
      .eq("record_id", itemYear.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("catalogue_publish_blockers", { p_record_id: itemYear.id }),
    supabase
      .from("catalogue_listings")
      .select("title,is_current,last_seen_at")
      .eq("record_id", itemYear.id)
      .maybeSingle(),
    supabase
      .from("catalogue_change_events")
      .select(
        "id,event_kind,draft_revision,editing_session_id,version_id,created_at",
      )
      .eq("record_id", itemYear.id)
      .order("created_at", { ascending: false }),
  ]);
  if (versionsResult.error) throw versionsResult.error;
  if (publicationsResult.error) throw publicationsResult.error;
  if (targetsResult.error) throw targetsResult.error;
  if (blockersResult.error) throw blockersResult.error;
  if (listingResult.error) throw listingResult.error;
  if (changeEventsResult.error) throw changeEventsResult.error;

  const appliedVersionIds = new Set(
    (targetsResult.data ?? []).flatMap((target) =>
      target.applied_version_id === null ? [] : [target.applied_version_id],
    ),
  );
  const currentVersionId =
    (versionsResult.data ?? []).find(
      (version) =>
        version.sealed_at !== null &&
        (version.id === itemYear.published_version_id ||
          (version.import_target_id !== null &&
            appliedVersionIds.has(version.id))),
    )?.id ?? null;
  const title = await versionTitle(supabase, kind, currentVersionId);

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
    code: itemYear.catalogue_codes.code,
    academicYear,
    codeId: itemYear.code_id,
    recordId: itemYear.id,
    recordPublicId: itemYear.public_id,
    title: title ?? listingResult.data?.title ?? itemYear.catalogue_codes.code,
    currentVersionId,
    publishedVersionId: itemYear.published_version_id,
    archivedAt: itemYear.archived_at,
    isListedByAnu: listingResult.data?.is_current ?? null,
    listingTitle: listingResult.data?.title ?? null,
    lastSeenAt: listingResult.data?.last_seen_at ?? null,
    publishBlockers: (blockersResult.data as string[] | null) ?? [],
    versions: (versionsResult.data ?? []).map((version) => ({
      id: version.id,
      publicId: version.public_id,
      origin: version.origin,
      createdAt: version.created_at,
      sealedAt: version.sealed_at,
      basedOnVersionId: version.based_on_version_id,
      importTargetId: version.import_target_id,
      contentHash: version.content_hash,
    })),
    publications: (publicationsResult.data ?? []).map((publication) => ({
      versionId: publication.version_id,
      publishedAt: publication.published_at,
      publishedBy: publication.published_by,
      unpublishedAt: publication.unpublished_at,
      unpublishedBy: publication.unpublished_by,
    })),
    changeEvents: (changeEventsResult.data ?? []).map((event) => ({
      id: event.id,
      eventKind:
        event.event_kind as CatalogueRecord["changeEvents"][number]["eventKind"],
      draftRevision: event.draft_revision,
      editingSessionId: event.editing_session_id,
      versionId: event.version_id,
      createdAt: event.created_at,
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
      baselineVersionId: target.baseline_version_id,
      candidateVersionId: target.candidate_version_id,
      entries: entriesByTarget.get(target.id) ?? [],
    })),
  };
}

/** The editable content of a snapshot, read through the import connection. */
export async function loadSnapshotWrite(
  snapshotId: number,
): Promise<CatalogueContent | null> {
  return withImportDatabaseClient((sql) => readVersionContent(sql, snapshotId));
}

/** The student-facing course details for a snapshot, or null for structures. */
export async function loadSnapshotCoursePreview(snapshotId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "admin_catalogue_version_projection",
    {
      p_version_id: snapshotId,
    },
  );
  if (error) throw error;
  if (data === null) return null;
  return courseFromSnapshotProjection(data as Json, snapshotId);
}
