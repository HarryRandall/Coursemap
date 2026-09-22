import "server-only";
import { readVersionContent } from "@/lib/catalogue-import/version-content";
import { withSyncDatabaseClient } from "@/lib/catalogue-sync/sync-store";
import type { CatalogueContent } from "@/lib/catalogue/content";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { CatalogueKind } from "./catalogue-kinds";
import { courseFromSnapshotProjection } from "./published-courses";

export type CatalogueSync = {
  id: string;
  status:
    | "queued"
    | "running"
    | "unchanged"
    | "review_required"
    | "applied"
    | "failed"
    | "cancelled";
  trigger: "manual" | "scheduled";
  requestedAt: string;
  checkedAt: string | null;
  completedAt: string | null;
  previousSourceVersionId: number | null;
  sourceVersionId: number | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type CatalogueVersion = {
  id: number;
  publicId: string;
  origin: string;
  createdAt: string;
  sealedAt: string | null;
  basedOnVersionId: number | null;
  syncId: string | null;
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
  latestSourceVersionId: number | null;
  sourceCheckedAt: string | null;
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
    eventKind:
      | "edit"
      | "publish"
      | "unpublish"
      | "discard"
      | "restore"
      | "source_draft_created"
      | "source_checked"
      | "source_changed"
      | "sync_failed";
    draftRevision: number | null;
    editingSessionId: string | null;
    versionId: number | null;
    createdAt: string;
  }>;
  syncs: CatalogueSync[];
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

/** Everything the record page needs: local content and independent ANU sync state. */
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
      "id,public_id,code_id,published_version_id,latest_source_version_id,source_checked_at,archived_at,catalogue_codes!inner(code,kind),academic_years!inner(year)",
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
    syncsResult,
    blockersResult,
    listingResult,
    changeEventsResult,
  ] = await Promise.all([
    supabase
      .from("catalogue_versions")
      .select(
        "id,public_id,origin,created_at,sealed_at,based_on_version_id,sync_id,content_hash",
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
      .from("catalogue_syncs")
      .select(
        "id,status,trigger,requested_at,checked_at,completed_at,previous_source_version_id,source_version_id,error_code,error_message",
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
  if (syncsResult.error) throw syncsResult.error;
  if (blockersResult.error) throw blockersResult.error;
  if (listingResult.error) throw listingResult.error;
  if (changeEventsResult.error) throw changeEventsResult.error;

  const currentVersionId = itemYear.published_version_id;
  const title = await versionTitle(supabase, kind, currentVersionId);

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
    latestSourceVersionId: itemYear.latest_source_version_id,
    sourceCheckedAt: itemYear.source_checked_at,
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
      syncId: version.sync_id,
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
    syncs: (syncsResult.data ?? []).map((sync) => ({
      id: sync.id,
      status: sync.status as CatalogueSync["status"],
      trigger: sync.trigger as CatalogueSync["trigger"],
      requestedAt: sync.requested_at,
      checkedAt: sync.checked_at,
      completedAt: sync.completed_at,
      previousSourceVersionId: sync.previous_source_version_id,
      sourceVersionId: sync.source_version_id,
      errorCode: sync.error_code,
      errorMessage: sync.error_message,
    })),
  };
}

/** The editable content of an immutable catalogue version. */
export async function loadVersionWrite(
  versionId: number,
): Promise<CatalogueContent | null> {
  return withSyncDatabaseClient((sql) => readVersionContent(sql, versionId));
}

/** The student-facing course details for a version, or null for structures. */
export async function loadVersionCoursePreview(versionId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "admin_catalogue_version_projection",
    {
      p_version_id: versionId,
    },
  );
  if (error) throw error;
  if (data === null) return null;
  return courseFromSnapshotProjection(data as Json, versionId);
}
