import { revalidateTag } from "next/cache";
import { publishedRecordTags } from "../coursemap/published-cache.ts";
import type { SyncSql } from "../catalogue-sync/sync-store.ts";
import { publishCatalogueDraft } from "../catalogue/drafts.ts";
import type { CatalogueContent } from "../catalogue/content.ts";

import { sourceFirstPublicationEligible } from "./eligibility.ts";

export async function setCourseRunAutoPublish(
  sql: SyncSql,
  runId: string,
  userId: string,
  enabled: boolean,
) {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    const rows = await tx`
      update public.catalogue_course_runs set publish_verified = ${enabled}
      where id = ${runId}::uuid and requested_by = ${userId}::uuid
        and private.has_permission('imports.manage') and private.has_permission(case when kind = 'course' then 'courses.write' else 'catalogue.write' end)
      returning id
    `;
    if (!rows.length)
      throw new Error(
        "Only the import's initiator with catalogue publication permission can change auto-publish.",
      );
  });
}

/** Bounded batches reuse saved candidates and never submit extraction requests. */
export async function publishSavedCourseRunDrafts(
  sql: SyncSql,
  runId: string,
  userId: string,
  afterRecordId = 0,
) {
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    const [permission] =
      await tx`select private.has_permission('imports.manage') and private.has_permission(case when kind = 'course' then 'courses.write' else 'catalogue.write' end) as allowed from public.catalogue_course_runs where id = ${runId}::uuid`;
    if (!permission?.allowed)
      throw new Error("Catalogue publication permission is required.");
  });
  const rows = await sql`
    select items.record_id, drafts.revision, drafts.content
    from public.catalogue_course_run_items items
    join public.catalogue_syncs syncs on syncs.id = items.sync_id
    join public.catalogue_drafts drafts on drafts.record_id = items.record_id
    join public.catalogue_records records on records.id = items.record_id
    where items.run_id = ${runId}::uuid and items.record_id > ${afterRecordId}
      and records.published_version_id is null
      and syncs.status in ('applied', 'review_required', 'unchanged')
    order by items.record_id limit 11
  `;
  let published = 0;
  let held = 0;
  const batch = rows.slice(0, 10);
  for (const row of batch) {
    const content = row.content as CatalogueContent;
    if (!sourceFirstPublicationEligible(content)) {
      held++;
      continue;
    }
    try {
      await publishCatalogueDraft({
        recordId: Number(row.record_id),
        expectedRevision: Number(row.revision),
        userId,
        importRunId: runId,
        importPublicationMode: "verified-draft",
        sql,
      });
      published++;
      for (const tag of publishedRecordTags({
        kind: content.kind,
        academicYear: content.academicYear,
        code: content.code,
      }))
        revalidateTag(tag, { expire: 0 });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "CatalogueDraftError" ||
          error.name === "CatalogueDraftConflictError")
      )
        held++;
      else throw error;
    }
  }
  return {
    published,
    held,
    hasMore: rows.length > 10,
    afterRecordId: batch.length
      ? Number(batch.at(-1)!.record_id)
      : afterRecordId,
  };
}

export async function publishVerifiedRunCandidate(
  sql: SyncSql,
  syncId: string,
  content: CatalogueContent,
) {
  if (!sourceFirstPublicationEligible(content)) return;
  const [candidate] = await sql`
    select runs.id, runs.requested_by, items.record_id, drafts.revision
    from public.catalogue_course_runs runs join public.catalogue_course_run_items items on items.run_id = runs.id
    join public.catalogue_drafts drafts on drafts.record_id = items.record_id
    where items.sync_id = ${syncId}::uuid and runs.publish_verified and runs.state = 'active'
  `;
  if (!candidate) return;
  try {
    const result = await publishCatalogueDraft({
      recordId: Number(candidate.record_id),
      expectedRevision: Number(candidate.revision),
      userId: String(candidate.requested_by),
      importRunId: String(candidate.id),
      sql,
    });
    for (const tag of publishedRecordTags({
      kind: content.kind,
      academicYear: content.academicYear,
      code: content.code,
    }))
      revalidateTag(tag, { expire: 0 });
    return result;
  } catch (error) {
    // A concurrent edit or review blocks publication, not the imported source.
    if (
      error instanceof Error &&
      (error.name === "CatalogueDraftError" ||
        error.name === "CatalogueDraftConflictError")
    )
      return;
    await sql`update public.catalogue_course_runs set state = 'paused', pause_reason = 'Publication needs attention. The imported source and draft have been preserved.' where id = ${candidate.id}::uuid`;
    return;
  }
}
