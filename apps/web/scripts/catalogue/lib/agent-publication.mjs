// Publishes drafts created by agent-answered imports. Agent answers are saved
// only after an independent check approves them, so this step takes the place
// of the administrator approving each first reading on the Changes tab. Drafts
// with extraction errors, edits or an existing publication stay held.
import { randomUUID } from "node:crypto";

import { AGENT_IMPORT_MODEL } from "../../../lib/catalogue-import/agent-extraction.ts";

export async function readAgentPublicationCandidates(sql, { year, kinds }) {
  const rows = await sql`
    select distinct on (records.id) records.id, records.kind, codes.code
    from public.catalogue_records records
    join public.catalogue_codes codes on codes.id = records.code_id
    join public.academic_years years on years.id = records.academic_year_id
    join public.catalogue_drafts drafts on drafts.record_id = records.id
    join public.catalogue_syncs syncs on syncs.record_id = records.id and syncs.source_version_id = records.latest_source_version_id
    where years.year = ${year} and records.kind = any(${kinds}::text[])
      and records.archived_at is null and records.published_version_id is null
      and syncs.requested_model = ${AGENT_IMPORT_MODEL} and syncs.status in ('applied', 'review_required', 'unchanged')
      and drafts.updated_by is null and drafts.base_version_id = records.latest_source_version_id
      and not exists (
        select 1 from jsonb_array_elements(drafts.content->'flags') flag
        where flag->>'severity' = 'error'
      )
    order by records.id
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    kind: String(row.kind),
    code: String(row.code),
  }));
}

/** Accepts every open first reading for the record, then publishes its draft. */
export async function publishAgentDraft(
  sql,
  { recordId, userId, resolveSourceChange, publishCatalogueDraft },
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
