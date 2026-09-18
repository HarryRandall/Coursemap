import { applyAcceptedChanges } from "./changes.ts";
import { type ImportSql, withImportDatabaseClient } from "./import-store.ts";
import { insertSnapshotContent } from "./persist-snapshot.ts";
import { contentHashForWrite, readSnapshotWrite } from "./snapshot-read.ts";
import type { CatalogueKind } from "./snapshot-write.ts";

export class ApplyReviewError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ApplyReviewError";
    this.code = code;
  }
}

/**
 * Turns a reviewed target into a new draft: the baseline with every accepted
 * change applied, rejected changes left as they were. Refuses when changes
 * are still open or the item year's draft moved since the import ran.
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
        select targets.id, targets.kind, targets.item_year_id, targets.academic_year_id,
          targets.baseline_snapshot_id, targets.candidate_snapshot_id, targets.source_page_id,
          targets.status, targets.applied_at,
          item_years.draft_snapshot_id, item_years.published_snapshot_id, item_years.archived_at
        from public.catalogue_import_targets as targets
        join public.catalogue_item_years as item_years on item_years.id = targets.item_year_id
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
      if (target.status !== "ready" || !target.candidate_snapshot_id) {
        throw new ApplyReviewError(
          "Only targets that are ready for review can be applied.",
          "55000",
        );
      }
      if (target.archived_at)
        throw new ApplyReviewError("The record is archived.", "55000");

      const currentBaseline =
        target.draft_snapshot_id === null
          ? target.published_snapshot_id === null
            ? null
            : Number(target.published_snapshot_id)
          : Number(target.draft_snapshot_id);
      const importBaseline =
        target.baseline_snapshot_id === null
          ? null
          : Number(target.baseline_snapshot_id);
      if (currentBaseline !== importBaseline) {
        throw new ApplyReviewError(
          "The record changed since this import ran. Start a new import to review against the current draft.",
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
      const candidateId = Number(target.candidate_snapshot_id);
      const kind = target.kind as CatalogueKind;
      const itemYearId = Number(target.item_year_id);

      // Everything accepted: the candidate itself becomes the draft.
      if (importBaseline === null || accepted.size === entries.length) {
        await tx`
          update public.catalogue_item_years set draft_snapshot_id = ${candidateId} where id = ${itemYearId}
        `;
        await tx`
          update public.catalogue_import_targets
          set applied_snapshot_id = ${candidateId}, applied_at = now()
          where id = ${targetId}::uuid
        `;
        return { draftSnapshotId: candidateId, reusedCandidate: true };
      }

      const baselineWrite = await readSnapshotWrite(tx, importBaseline);
      const candidateWrite = await readSnapshotWrite(tx, candidateId);
      if (!baselineWrite || !candidateWrite) {
        throw new ApplyReviewError(
          "The snapshots for this review could not be read.",
          "P0002",
        );
      }
      // Nothing accepted: the baseline stays the draft and the review is closed.
      if (accepted.size === 0) {
        await tx`
          update public.catalogue_import_targets
          set applied_snapshot_id = ${importBaseline}, applied_at = now()
          where id = ${targetId}::uuid
        `;
        return { draftSnapshotId: importBaseline, reusedCandidate: false };
      }

      const merged = applyAcceptedChanges(
        baselineWrite,
        candidateWrite,
        accepted,
      );
      merged.contentHash = contentHashForWrite(merged);
      const [snapshot] = await tx`
        insert into public.catalogue_snapshots (
          item_year_id, kind, academic_year_id, origin, based_on_snapshot_id, source_page_id,
          content_hash, import_target_id, created_by
        ) values (
          ${itemYearId}, ${kind}, ${Number(target.academic_year_id)}, 'import', ${importBaseline},
          ${target.source_page_id}, ${merged.contentHash}, ${targetId}::uuid, ${userId}::uuid
        )
        returning id
      `;
      const snapshotId = Number(snapshot.id);
      await insertSnapshotContent(tx, {
        snapshotId,
        kind,
        academicYearId: Number(target.academic_year_id),
        sourcePageId:
          target.source_page_id === null ? null : Number(target.source_page_id),
        write: merged,
      });
      await tx`
        update public.catalogue_item_years set draft_snapshot_id = ${snapshotId} where id = ${itemYearId}
      `;
      await tx`
        update public.catalogue_import_targets
        set applied_snapshot_id = ${snapshotId}, applied_at = now()
        where id = ${targetId}::uuid
      `;
      return { draftSnapshotId: snapshotId, reusedCandidate: false };
    });
  return sql ? work(sql) : withImportDatabaseClient(work);
}
