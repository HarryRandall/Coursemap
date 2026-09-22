import "server-only";

import {
  changeSummary,
  diffSnapshotWrites,
} from "@/lib/catalogue-import/changes";
import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "@/lib/catalogue-import/version-content";
import type {
  SyncSql,
  SyncTransactionSql,
} from "@/lib/catalogue-sync/sync-store";
import { withSyncDatabaseClient } from "@/lib/catalogue-sync/sync-store";
import { fieldLabel } from "@/lib/coursemap/catalogue-kinds";
import type { CatalogueContent } from "./content";
import {
  CatalogueDraftError,
  catalogueRecordForUpdate,
  createDraftInTransaction,
} from "./drafts";
import { applyReviewUnits, evidenceBelongsToReviewUnit } from "./review-units";
import type { SourceReviewDecision } from "./source-review-store";

/**
 * Moves the draft provenance for one accepted path to the source version that
 * supplied it. Evidence carries extraction field keys, so only the entries
 * naming this unit move. A path the source version cannot evidence loses its
 * manual provenance rather than gaining an invented method, because nobody can
 * say how ANU produced it.
 */
async function moveProvenanceToSource(
  tx: SyncTransactionSql,
  {
    recordId,
    fieldPath,
    sourceVersionId,
  }: { recordId: number; fieldPath: string; sourceVersionId: number },
) {
  const evidence = await tx`
    select id, field_path, method from public.catalogue_version_provenance
    where version_id = ${sourceVersionId}
  `;
  const claimed = evidence.filter((row) =>
    evidenceBelongsToReviewUnit(fieldPath, String(row.field_path)),
  );
  const paths = [fieldPath, ...claimed.map((row) => String(row.field_path))];
  await tx`
    delete from public.catalogue_draft_provenance
    where record_id = ${recordId} and field_path = any(${paths})
  `;
  for (const row of claimed) {
    await tx`
      insert into public.catalogue_draft_provenance (
        record_id, field_path, origin, source_version_id, source_evidence_id
      ) values (
        ${recordId}, ${String(row.field_path)}, ${String(row.method)},
        ${sourceVersionId}, ${Number(row.id)}
      )
    `;
  }
}

/**
 * Applies or dismisses one review row. Use ANU writes exactly that path into
 * the mutable draft; Keep current leaves the draft and its provenance alone.
 * Neither publishes anything, and neither touches another path's review.
 */
export async function resolveSourceChange({
  recordId,
  changeId,
  decision,
  userId,
  sql,
}: {
  recordId: number;
  changeId: number;
  decision: SourceReviewDecision;
  userId: string;
  sql?: SyncSql;
}) {
  const work = (client: SyncSql) =>
    client.begin(async (tx) => {
      const record = await catalogueRecordForUpdate(tx, recordId);
      if (record.archived_at)
        throw new CatalogueDraftError(
          "The catalogue record is archived.",
          "ARCHIVED",
        );
      const [row] = await tx`
        select changes.*, versions.id as source_version_id
        from public.catalogue_sync_changes as changes
        join public.catalogue_versions as versions on versions.sync_id = changes.sync_id
        where changes.id = ${changeId} and changes.record_id = ${recordId}
        for update of changes
      `;
      if (!row)
        throw new CatalogueDraftError(
          "The ANU change is no longer available.",
          "NOT_FOUND",
        );
      if (row.superseded_at !== null)
        throw new CatalogueDraftError(
          "A newer ANU sync replaced this review. Reload to see the current changes.",
          "SUPERSEDED",
        );
      if (row.decision !== null)
        throw new CatalogueDraftError(
          "This ANU change has already been decided.",
          "ALREADY_RESOLVED",
        );

      const [draftRow] = await tx`
        select * from public.catalogue_drafts where record_id = ${recordId} for update
      `;
      const draft = draftRow
        ? {
            content: draftRow.content as CatalogueContent,
            revision: Number(draftRow.revision),
          }
        : await createDraftInTransaction(tx, record, userId).then(
            (created) => ({
              content: created.content,
              revision: created.revision,
            }),
          );
      const fieldPath = String(row.field_path);
      const sourceVersionId =
        row.source_version_id === null ? null : Number(row.source_version_id);

      let revision = draft.revision;
      if (decision === "use_source") {
        if (sourceVersionId === null)
          throw new CatalogueDraftError(
            "The ANU version behind this change could not be read.",
            "INVALID_BASE",
          );
        const candidate = await readVersionContent(tx, sourceVersionId);
        if (!candidate)
          throw new CatalogueDraftError(
            "The ANU version behind this change could not be read.",
            "INVALID_BASE",
          );
        const next = applyReviewUnits(
          draft.content,
          candidate,
          new Set([fieldPath]),
        );
        const fieldChanges = diffSnapshotWrites(draft.content, next);
        if (fieldChanges.length > 0) {
          revision = draft.revision + 1;
          const contentHash = contentHashForCatalogueContent(next);
          const accepted = { ...next, contentHash } satisfies CatalogueContent;
          await tx`
            update public.catalogue_drafts
            set content = ${tx.json(accepted as never)}, content_hash = ${contentHash},
              revision = ${revision}, updated_by = ${userId}::uuid, updated_at = now()
            where record_id = ${recordId}
          `;
          const [event] = await tx`
            insert into public.catalogue_change_events (
              record_id, draft_revision, event_kind, origin, actor_id, version_id
            ) values (
              ${recordId}, ${revision}, 'source_accepted', 'source',
              ${userId}::uuid, ${sourceVersionId}
            ) returning id
          `;
          for (const [position, change] of fieldChanges.entries()) {
            await tx`
              insert into public.catalogue_field_changes (
                event_id, position, field_path, old_value, new_value
              ) values (
                ${event.id}, ${position}, ${change.fieldPath},
                ${tx.json(change.oldValue as never)},
                ${tx.json(change.newValue as never)}
              )
            `;
          }
          await moveProvenanceToSource(tx, {
            recordId,
            fieldPath,
            sourceVersionId,
          });
        }
      } else {
        await tx`
          insert into public.catalogue_change_events (
            record_id, draft_revision, event_kind, origin, actor_id, version_id
          ) values (
            ${recordId}, ${revision}, 'source_kept', 'source', ${userId}::uuid,
            ${sourceVersionId}
          )
        `;
      }

      await tx`
        update public.catalogue_sync_changes
        set decision = ${decision}, resolved_by = ${userId}::uuid, resolved_at = now()
        where id = ${changeId}
      `;
      return {
        fieldPath,
        label: fieldLabel(fieldPath),
        decision,
        revision,
        summary: changeSummary(
          fieldPath,
          row.local_value,
          row.incoming_source_value,
        ),
      };
    });
  return sql ? work(sql) : withSyncDatabaseClient(work);
}
