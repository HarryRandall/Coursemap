import "server-only";
import {
  CHANGELOG_PAGE_SIZE,
  type CatalogueChangelog,
  type ChangelogEntryView,
  type ChangelogEvent,
  groupChangelogEvents,
} from "@/lib/catalogue/changelog";
import { createClient } from "@/lib/supabase/server";

/**
 * The record's timeline, newest first. Raw events are never rewritten; the
 * grouping here is presentation, and an entry carries the event ids it covers.
 * A group is not stitched across a page boundary, so the oldest entry on a
 * page can be part of a session that continues on the next one.
 */
export async function loadCatalogueChangelog({
  recordId,
  limit = CHANGELOG_PAGE_SIZE,
}: {
  recordId: number;
  limit?: number;
}): Promise<CatalogueChangelog> {
  const supabase = await createClient();
  const { data: eventRows, error } = await supabase
    .from("catalogue_change_events")
    .select(
      "id,event_kind,origin,actor_id,editing_session_id,version_id,sync_change_id,created_at",
    )
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw error;
  const hasMore = (eventRows?.length ?? 0) > limit;
  const rows = (eventRows ?? []).slice(0, limit);
  if (rows.length === 0) return { entries: [], shown: 0, hasMore: false };

  const eventIds = rows.map((row) => row.id);
  const syncChangeIds = rows.flatMap((row) =>
    row.sync_change_id === null ? [] : [row.sync_change_id],
  );
  const actorIds = [
    ...new Set(rows.flatMap((row) => (row.actor_id ? [row.actor_id] : []))),
  ];
  const sourceVersionIds = rows.flatMap((row) =>
    row.event_kind === "source_changed" && row.version_id !== null
      ? [row.version_id]
      : [],
  );

  const [fieldChanges, decisions, actors, versions, sourceVersions] =
    await Promise.all([
      supabase
        .from("catalogue_field_changes")
        .select("event_id,position,field_path,old_value,new_value")
        .in("event_id", eventIds)
        .order("position"),
      syncChangeIds.length
        ? supabase
            .from("catalogue_sync_changes")
            .select("id,field_path,decision")
            .in("id", syncChangeIds)
        : { data: [], error: null },
      actorIds.length
        ? supabase
            .from("admin_users")
            .select("user_id,display_name")
            .in("user_id", actorIds)
        : { data: [], error: null },
      supabase
        .from("catalogue_versions")
        .select("id")
        .eq("record_id", recordId)
        .order("id"),
      sourceVersionIds.length
        ? supabase
            .from("catalogue_versions")
            .select("id,sync_id")
            .in("id", sourceVersionIds)
        : { data: [], error: null },
    ]);
  if (fieldChanges.error) throw fieldChanges.error;
  if (decisions.error) throw decisions.error;
  if (actors.error) throw actors.error;
  if (versions.error) throw versions.error;
  if (sourceVersions.error) throw sourceVersions.error;

  const syncIds = (sourceVersions.data ?? []).flatMap((version) =>
    version.sync_id ? [version.sync_id] : [],
  );
  const reviewRows = syncIds.length
    ? await supabase
        .from("catalogue_sync_changes")
        .select("sync_id,classification")
        .in("sync_id", syncIds)
        .in("classification", ["source_change", "conflict"])
    : { data: [], error: null };
  if (reviewRows.error) throw reviewRows.error;

  const fieldsByEvent = new Map<number, ChangelogEvent["fields"]>();
  for (const change of fieldChanges.data ?? []) {
    const list = fieldsByEvent.get(change.event_id) ?? [];
    list.push({
      fieldPath: change.field_path,
      oldValue: change.old_value,
      newValue: change.new_value,
    });
    fieldsByEvent.set(change.event_id, list);
  }
  const decisionById = new Map(
    (decisions.data ?? []).map((row) => [
      row.id,
      {
        fieldPath: row.field_path,
        decision: row.decision as "use_source" | "keep_local",
      },
    ]),
  );
  const actorNames = new Map(
    (actors.data ?? []).flatMap((actor) =>
      actor.user_id && actor.display_name
        ? [[actor.user_id, actor.display_name] as const]
        : [],
    ),
  );
  const ordinalByVersion = new Map(
    (versions.data ?? []).map((version, index) => [version.id, index + 1]),
  );
  const syncByVersion = new Map(
    (sourceVersions.data ?? []).map((version) => [version.id, version.sync_id]),
  );
  const reviewCounts = new Map<string, { total: number; conflicts: number }>();
  for (const row of reviewRows.data ?? []) {
    const counts = reviewCounts.get(row.sync_id) ?? { total: 0, conflicts: 0 };
    counts.total += 1;
    if (row.classification === "conflict") counts.conflicts += 1;
    reviewCounts.set(row.sync_id, counts);
  }

  const events: ChangelogEvent[] = rows.map((row) => ({
    id: row.id,
    eventKind: row.event_kind as ChangelogEvent["eventKind"],
    origin: row.origin as ChangelogEvent["origin"],
    actorId: row.actor_id,
    editingSessionId: row.editing_session_id,
    versionId: row.version_id,
    syncChangeId: row.sync_change_id,
    createdAt: row.created_at,
    fields: fieldsByEvent.get(row.id) ?? [],
    decision:
      row.sync_change_id === null
        ? null
        : (decisionById.get(row.sync_change_id) ?? null),
  }));

  const entries = groupChangelogEvents(events).map((entry) => {
    const syncId = entry.versionId ? syncByVersion.get(entry.versionId) : null;
    return {
      ...entry,
      actorName: entry.actorId ? (actorNames.get(entry.actorId) ?? null) : null,
      versionOrdinal: entry.versionId
        ? (ordinalByVersion.get(entry.versionId) ?? null)
        : null,
      sourceChanges: syncId ? (reviewCounts.get(syncId) ?? null) : null,
    } satisfies ChangelogEntryView;
  });
  return { entries, shown: rows.length, hasMore };
}
