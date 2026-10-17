// Publishes drafts created by agent-answered imports. Agent answers are saved
// only after an independent check approves them, so this step takes the place
// of the administrator approving each first reading on the Changes tab. Drafts
// with extraction errors or edits stay held, and a draft that matches its
// publication has nothing to publish.
//
// The fallback is an explicit opt-in for the local agent pipeline only. After
// the answer and check rounds, an untouched course draft whose only errors
// are about requisites publishes what was modelled, with ANU's leftover
// wording as "Check with ANU" notes and its errors lowered to warnings.
import { randomUUID } from "node:crypto";

import { AGENT_IMPORT_MODEL } from "../../../lib/catalogue-import/agent-extraction.ts";

/**
 * Untouched agent drafts ready to publish. With fallback, the course drafts
 * held only by requisite errors instead: every error flag's field is
 * `requisites` or below it.
 */
export async function readAgentPublicationCandidates(
  sql,
  { year, kinds, fallback = false },
) {
  const errorFilter = fallback
    ? sql`
      and records.kind = 'course'
      and exists (
        select 1 from jsonb_array_elements(drafts.content->'flags') flag
        where flag->>'severity' = 'error'
      )
      and not exists (
        select 1 from jsonb_array_elements(drafts.content->'flags') flag
        where flag->>'severity' = 'error'
          and coalesce(flag->>'fieldPath', '') <> 'requisites'
          and coalesce(flag->>'fieldPath', '') not like 'requisites.%'
      )`
    : sql`
      and not exists (
        select 1 from jsonb_array_elements(drafts.content->'flags') flag
        where flag->>'severity' = 'error'
      )`;
  const rows = await sql`
    select distinct on (records.id) records.id, records.kind, codes.code
    from public.catalogue_records records
    join public.catalogue_codes codes on codes.id = records.code_id
    join public.academic_years years on years.id = records.academic_year_id
    join public.catalogue_drafts drafts on drafts.record_id = records.id
    join public.catalogue_syncs syncs on syncs.record_id = records.id and syncs.source_version_id = records.latest_source_version_id
    where years.year = ${year} and records.kind = any(${kinds}::text[])
      and records.archived_at is null
      and syncs.requested_model = ${AGENT_IMPORT_MODEL} and syncs.status in ('applied', 'review_required', 'unchanged')
      and drafts.updated_by is null and drafts.base_version_id = records.latest_source_version_id
      and drafts.content_hash is distinct from (
        select versions.content_hash from public.catalogue_versions versions
        where versions.id = records.published_version_id
      )
      ${errorFilter}
    order by records.id
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    kind: String(row.kind),
    code: String(row.code),
  }));
}

/**
 * Rewrites one untouched agent draft with the requisite fallback. Refuses a
 * draft an administrator has edited, one no longer based on the latest
 * source reading, and one with an error outside its requisites. The change
 * is audited as an edit by the local administrator. Returns the notes added
 * and how many errors became warnings.
 */
export async function applyRequisiteFallback(
  sql,
  {
    recordId,
    userId,
    requisiteFallbackContent,
    validateCatalogueContent,
    diffSnapshotWrites,
  },
) {
  return sql.begin(async (tx) => {
    const [row] = await tx`
      select drafts.content, drafts.revision, drafts.updated_by,
        drafts.base_version_id, records.latest_source_version_id
      from public.catalogue_drafts drafts
      join public.catalogue_records records on records.id = drafts.record_id
      where drafts.record_id = ${recordId}
      for update of drafts
    `;
    if (!row) throw new Error("The draft no longer exists.");
    if (row.updated_by !== null)
      throw new Error("The draft has been edited since it was imported.");
    if (String(row.base_version_id) !== String(row.latest_source_version_id))
      throw new Error("The draft is not based on the latest ANU reading.");
    const content = validateCatalogueContent(row.content);
    const result = requisiteFallbackContent(content);
    if ("refused" in result) throw new Error(result.refused);
    const revision = Number(row.revision) + 1;
    await tx`
      update public.catalogue_drafts
      set content = ${tx.json(result.content)}, content_hash = ${result.content.contentHash},
        revision = ${revision}, updated_by = ${userId}::uuid, updated_at = now()
      where record_id = ${recordId}
    `;
    const [event] = await tx`
      insert into public.catalogue_change_events (
        record_id, draft_revision, event_kind, origin, actor_id
      ) values (${recordId}, ${revision}, 'edit', 'manual', ${userId}::uuid)
      returning id
    `;
    const changes = diffSnapshotWrites(content, result.content);
    for (const [position, change] of [
      ...changes,
      {
        fieldPath: "flags",
        oldValue: content.flags,
        newValue: result.content.flags,
      },
    ].entries())
      await tx`
        insert into public.catalogue_field_changes (
          event_id, position, field_path, old_value, new_value
        ) values (
          ${event.id}, ${position}, ${change.fieldPath},
          ${tx.json(change.oldValue ?? null)}, ${tx.json(change.newValue ?? null)}
        )
      `;
    return {
      revision,
      notes: result.notes,
      downgraded: result.downgraded,
      softened: result.softened,
    };
  });
}

/**
 * Publishes a draft held only by requisite errors: accepts its first
 * readings, applies the fallback, then publishes it.
 */
export async function publishAgentFallbackDraft(sql, options) {
  const { recordId, userId, resolveSourceChange, publishCatalogueDraft } =
    options;
  await acceptFirstReadings(sql, { recordId, userId, resolveSourceChange });
  const fallback = await applyRequisiteFallback(sql, options);
  await publishCatalogueDraft({
    recordId,
    expectedRevision: fallback.revision,
    userId,
    editingSessionId: randomUUID(),
    sql,
  });
  return fallback;
}

async function acceptFirstReadings(
  sql,
  { recordId, userId, resolveSourceChange },
) {
  const changes = await sql`
    select id from public.catalogue_sync_changes
    where record_id = ${recordId} and superseded_at is null and decision is null
      and review_band in ('check', 'needs_review')
    order by id
  `;
  for (const change of changes)
    await resolveSourceChange({
      recordId,
      changeId: Number(change.id),
      decision: "use_source",
      userId,
      sql,
    });
}

/** Accepts every open first reading for the record, then publishes its draft. */
export async function publishAgentDraft(
  sql,
  { recordId, userId, resolveSourceChange, publishCatalogueDraft },
) {
  await acceptFirstReadings(sql, { recordId, userId, resolveSourceChange });
  const [draft] =
    await sql`select revision from public.catalogue_drafts where record_id = ${recordId}`;
  return publishCatalogueDraft({
    recordId,
    expectedRevision: Number(draft.revision),
    userId,
    editingSessionId: randomUUID(),
    sql,
  });
}
