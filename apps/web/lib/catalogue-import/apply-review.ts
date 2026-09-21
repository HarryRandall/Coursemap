import { applyAcceptedChanges } from "./changes.ts";
import { type ImportSql, withImportDatabaseClient } from "./import-store.ts";
import { insertVersionContent } from "./persist-version.ts";
import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "./version-content.ts";
import type { CatalogueKind } from "../catalogue/content.ts";

export class ApplyReviewError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ApplyReviewError";
    this.code = code;
  }
}

/**
 * Turns a reviewed target into a new immutable version: the baseline with every accepted
 * change applied, rejected changes left as they were. Refuses when changes
 * are still open or the record gained another meaningful version since the import ran.
 */
export async function applyImportReview({
  targetId,
  userId,
  sql,
}: {
  targetId: string;
  userId: string;
  sql?: ImportSql;
}) {
  const work = async (client: ImportSql) =>
    client.begin(async (tx) => {
      const [target] = await tx`
        select targets.id, targets.kind, targets.record_id, targets.academic_year_id,
          targets.baseline_version_id, targets.candidate_version_id, targets.source_page_id,
          targets.status, targets.applied_at,
          item_years.archived_at, current_version.id as current_version_id
        from public.catalogue_import_targets as targets
        join public.catalogue_records as item_years on item_years.id = targets.record_id
        left join lateral (
          select versions.id
          from public.catalogue_versions as versions
          left join public.catalogue_import_targets as version_targets
            on version_targets.id = versions.import_target_id
          where versions.record_id = item_years.id
            and versions.sealed_at is not null
            and (
              versions.import_target_id is null
              or version_targets.applied_version_id = versions.id
            )
          order by versions.created_at desc, versions.id desc
          limit 1
        ) as current_version on true
        where targets.id = ${targetId}::uuid
        for update of targets, item_years
      `;
      if (!target)
        throw new ApplyReviewError(
          "The import target no longer exists.",
          "P0002",
        );
      if (target.applied_at)
        throw new ApplyReviewError(
          "This review has already been applied.",
          "55000",
        );
      if (target.status !== "ready" || !target.candidate_version_id) {
        throw new ApplyReviewError(
          "Only targets that are ready for review can be applied.",
          "55000",
        );
      }
      if (target.archived_at)
        throw new ApplyReviewError("The record is archived.", "55000");

      const currentBaseline =
        target.current_version_id === null
          ? null
          : Number(target.current_version_id);
      const importBaseline =
        target.baseline_version_id === null
          ? null
          : Number(target.baseline_version_id);
      if (currentBaseline !== importBaseline) {
        throw new ApplyReviewError(
          "The record changed since this import ran. Start a new import to review against the current version.",
          "STALE_BASELINE",
        );
      }

      const entries = await tx`
        select field_path, status from public.catalogue_import_changes
        where target_id = ${targetId}::uuid and entry_kind = 'change'
      `;
      if (entries.some((entry) => entry.status === "open")) {
        throw new ApplyReviewError(
          "Accept or reject every change before applying.",
          "55000",
        );
      }
      const accepted = new Set(
        entries
          .filter((entry) => entry.status === "accepted")
          .map((entry) => String(entry.field_path)),
      );
      const candidateId = Number(target.candidate_version_id);
      const kind = target.kind as CatalogueKind;
      const recordId = Number(target.record_id);

      // Everything accepted: the candidate itself becomes the applied version.
      if (importBaseline === null || accepted.size === entries.length) {
        await tx`
          update public.catalogue_import_targets
          set applied_version_id = ${candidateId}, applied_at = now()
          where id = ${targetId}::uuid
        `;
        return { versionId: candidateId, reusedCandidate: true };
      }

      const baselineWrite = await readVersionContent(tx, importBaseline);
      const candidateWrite = await readVersionContent(tx, candidateId);
      if (!baselineWrite || !candidateWrite) {
        throw new ApplyReviewError(
          "The snapshots for this review could not be read.",
          "P0002",
        );
      }
      // Nothing accepted: the baseline stays current and the review is closed.
      if (accepted.size === 0) {
        await tx`
          update public.catalogue_import_targets
          set applied_version_id = ${importBaseline}, applied_at = now()
          where id = ${targetId}::uuid
        `;
        return { versionId: importBaseline, reusedCandidate: false };
      }

      const merged = applyAcceptedChanges(
        baselineWrite,
        candidateWrite,
        accepted,
      );
      merged.contentHash = contentHashForCatalogueContent(merged);
      const [snapshot] = await tx`
        insert into public.catalogue_versions (
          record_id, kind, academic_year_id, origin, based_on_version_id, source_page_id,
          content_hash, import_target_id, created_by
        ) values (
          ${recordId}, ${kind}, ${Number(target.academic_year_id)}, 'import', ${importBaseline},
          ${target.source_page_id}, ${merged.contentHash}, ${targetId}::uuid, ${userId}::uuid
        )
        returning id
      `;
      const snapshotId = Number(snapshot.id);
      await insertVersionContent(tx, {
        snapshotId,
        kind,
        academicYearId: Number(target.academic_year_id),
        sourcePageId:
          target.source_page_id === null ? null : Number(target.source_page_id),
        write: merged,
      });
      await tx`
        update public.catalogue_versions
        set sealed_at = greatest(statement_timestamp(), created_at)
        where id = ${snapshotId}
      `;
      await tx`
        update public.catalogue_import_targets
        set applied_version_id = ${snapshotId}, applied_at = now()
        where id = ${targetId}::uuid
      `;
      return { versionId: snapshotId, reusedCandidate: false };
    });
  return sql ? work(sql) : withImportDatabaseClient(work);
}
