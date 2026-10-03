import { randomUUID } from "node:crypto";
import { stableStringify } from "../catalogue-import/canonical.ts";
import {
  readSyncArtifact,
  type SyncArtifactLocator,
} from "../catalogue-sync/artifact-store.ts";
import {
  claimCatalogueSync,
  finishCatalogueSync,
  type SyncSql,
} from "../catalogue-sync/sync-store.ts";
import { persistSourceVersion } from "../catalogue-sync/persist-source-version.ts";
import { resolveSourceChange } from "../catalogue/source-review-decisions.ts";
import { courseKindAdapter } from "../catalogue-import/kinds/course/adapter.ts";
import { parseCourseSource } from "../catalogue-import/kinds/course/source-parser.ts";
import { loadKnownAcademicPeriods } from "../catalogue-import/kinds/course/periods.ts";
import type { CourseExtraction } from "../catalogue-import/kinds/course/contract.ts";

/** Reuses captured source, creates a new source version and accepts only calendar corrections. */
export async function repairCourseRunOfferings(
  sql: SyncSql,
  runId: string,
  readArtifact = (artifact: SyncArtifactLocator) =>
    readSyncArtifact({ artifact }),
) {
  const [run] =
    await sql`select requested_by, academic_year from public.catalogue_course_runs where id = ${runId}::uuid`;
  if (!run) throw new Error("The import run was not found.");
  const userId = String(run.requested_by);
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    const [permission] =
      await tx`select private.has_permission('imports.manage') and private.has_permission('courses.write') as allowed`;
    if (!permission.allowed)
      throw new Error(
        "Import and course-writing permissions are required to repair saved courses.",
      );
  });
  const periods = await loadKnownAcademicPeriods(
    sql,
    Number(run.academic_year),
  );
  const rows = await sql`
    select items.record_id, items.sync_id, codes.code, syncs.source_document_id, syncs.requested_model, syncs.prompt_version, syncs.schema_version
    from public.catalogue_course_run_items items
    join public.catalogue_syncs syncs on syncs.id = items.sync_id
    join public.catalogue_records records on records.id = items.record_id
    join public.catalogue_codes codes on codes.id = records.code_id
    join public.catalogue_drafts drafts on drafts.record_id = records.id
    join public.catalogue_versions versions on versions.id = syncs.source_version_id
    where items.run_id = ${runId}::uuid and records.published_version_id is null and records.archived_at is null
      and records.latest_source_version_id = syncs.source_version_id
      and drafts.content_hash = versions.content_hash and drafts.updated_by is null
      and not exists (select 1 from public.catalogue_syncs pending where pending.record_id = records.id and pending.status in ('queued', 'running'))
    order by codes.code
  `;
  const repaired: string[] = [];
  for (const row of rows) {
    const artifacts =
      await sql`select * from public.catalogue_sync_artifacts where sync_id = ${row.sync_id}::uuid and kind in ('normalised_markdown', 'validated_json') order by created_at desc`;
    const read = async (kind: string) => {
      const artifact = artifacts.find((item) => item.kind === kind);
      if (!artifact) throw new Error(`The saved ${kind} artefact is missing.`);
      return readArtifact({
        bucket: artifact.storage_bucket,
        path: String(artifact.storage_path),
        mediaType: String(artifact.media_type),
        byteSize: Number(artifact.byte_size),
        contentSha256: String(artifact.content_sha256),
      });
    };
    const markdown = await read("normalised_markdown");
    const extraction = JSON.parse(
      await read("validated_json"),
    ) as CourseExtraction;
    const parsed = parseCourseSource({
      code: String(row.code),
      year: Number(run.academic_year),
      markdown,
      context: { knownTags: [], knownAcademicPeriods: periods },
    });
    if (
      !parsed.offerings.length ||
      parsed.reviewItems.some((item) => item.fieldKey === "offerings")
    )
      continue;
    if (
      stableStringify(parsed.offerings) ===
      stableStringify(extraction.offerings)
    )
      continue;
    extraction.offerings = parsed.offerings;
    extraction.offeringStatus = parsed.offeringStatus;
    extraction.reviewItems = extraction.reviewItems.filter(
      (item) => item.fieldKey !== "offerings",
    );
    extraction.evidence = [
      ...extraction.evidence.filter((item) => item.fieldKey !== "offerings"),
      ...parsed.evidence.filter((item) => item.fieldKey === "offerings"),
    ];
    const [sync] =
      await sql`insert into public.catalogue_syncs (record_id, trigger, requested_model, parser_version, prompt_version, schema_version, requested_by) values (${row.record_id}, 'manual', ${row.requested_model}, 'anu-course-calendar-repair.v1', ${row.prompt_version}, ${row.schema_version}, ${userId}::uuid) returning id`;
    const workerId = randomUUID();
    const claim = await claimCatalogueSync(sql, {
      syncId: String(sync.id),
      workerId,
    });
    if (!claim)
      throw new Error("The calendar repair could not claim its sync.");
    const result = await persistSourceVersion(sql, {
      claim,
      sourceDocumentId: Number(row.source_document_id),
      write: courseKindAdapter.project(extraction),
    });
    await finishCatalogueSync(sql, {
      syncId: claim.syncId,
      workerId,
      expectedLockVersion: claim.lockVersion,
      status: result.status,
      sourceDocumentId: Number(row.source_document_id),
      sourceVersionId: result.sourceVersionId,
    });
    const changes =
      await sql`select id, field_path, classification from public.catalogue_sync_changes where sync_id = ${sync.id}::uuid and decision is null and superseded_at is null and field_path in ('course.sessions', 'course.offering')`;
    for (const change of changes) {
      if (change.classification === "conflict") continue;
      await resolveSourceChange({
        recordId: Number(row.record_id),
        changeId: Number(change.id),
        decision: "use_source",
        userId,
        sql,
      });
    }
    repaired.push(String(row.code));
  }
  return { repaired };
}
