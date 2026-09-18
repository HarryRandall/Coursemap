import { diffSnapshotWrites } from "./changes.ts";
import { type ImportSql, withImportDatabaseClient } from "./import-store.ts";
import { insertSnapshotContent } from "./persist-snapshot.ts";
import { contentHashForWrite, readSnapshotWrite } from "./snapshot-read.ts";
import type { CatalogueSnapshotWrite } from "./snapshot-write.ts";

export class ManualSnapshotError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ManualSnapshotError";
    this.code = code;
  }
}

/**
 * Saves an edited write as a new manual draft based on the snapshot the
 * editor started from. Open review changes on the edited fields close as
 * rejected, since the administrator has decided the value directly.
 */
export async function saveManualSnapshot({
  itemYearId,
  baseSnapshotId,
  write,
  userId,
  sql,
}: {
  itemYearId: number;
  baseSnapshotId: number | null;
  write: CatalogueSnapshotWrite;
  userId: string;
  sql?: ImportSql;
}) {
  const work = async (client: ImportSql) =>
    client.begin(async (tx) => {
      const [itemYear] = await tx`
        select item_years.id, item_years.kind, item_years.academic_year_id, item_years.draft_snapshot_id,
          item_years.published_snapshot_id, item_years.archived_at, items.code, academic_years.year
        from public.catalogue_item_years as item_years
        join public.catalogue_items as items on items.id = item_years.item_id
        join public.academic_years on academic_years.id = item_years.academic_year_id
        where item_years.id = ${itemYearId}
        for update of item_years
      `;
      if (!itemYear)
        throw new ManualSnapshotError("The record does not exist.", "P0002");
      if (itemYear.archived_at)
        throw new ManualSnapshotError("The record is archived.", "55000");
      if (
        write.kind !== itemYear.kind ||
        write.code !== itemYear.code ||
        write.academicYear !== Number(itemYear.year)
      ) {
        throw new ManualSnapshotError(
          "The edited content does not belong to this record.",
          "22023",
        );
      }
      const currentBase =
        itemYear.draft_snapshot_id === null
          ? itemYear.published_snapshot_id === null
            ? null
            : Number(itemYear.published_snapshot_id)
          : Number(itemYear.draft_snapshot_id);
      if (currentBase !== baseSnapshotId) {
        throw new ManualSnapshotError(
          "The record changed while you were editing. Reload and apply your changes again.",
          "STALE_BASE",
        );
      }

      const baseWrite = baseSnapshotId
        ? await readSnapshotWrite(tx, baseSnapshotId)
        : null;
      const contentHash = contentHashForWrite(write);
      if (baseWrite && contentHashForWrite(baseWrite) === contentHash) {
        return {
          snapshotId: baseSnapshotId!,
          unchanged: true,
          editedPaths: [] as string[],
        };
      }
      const editedPaths = diffSnapshotWrites(baseWrite, write).map(
        (change) => change.fieldPath,
      );

      const [snapshot] = await tx`
        insert into public.catalogue_snapshots (
          item_year_id, kind, academic_year_id, origin, based_on_snapshot_id, content_hash, created_by
        ) values (
          ${itemYearId}, ${itemYear.kind}, ${itemYear.academic_year_id}, 'manual', ${baseSnapshotId},
          ${contentHash}, ${userId}::uuid
        ) returning id
      `;
      const snapshotId = Number(snapshot.id);
      await insertSnapshotContent(tx, {
        snapshotId,
        kind: write.kind,
        academicYearId: Number(itemYear.academic_year_id),
        sourcePageId: null,
        write: {
          ...write,
          contentHash,
          evidence: write.evidence.map((item) => ({
            ...item,
            method: "manual" as const,
          })),
        },
      });
      await tx`update public.catalogue_item_years set draft_snapshot_id = ${snapshotId} where id = ${itemYearId}`;

      if (editedPaths.length > 0) {
        await tx`
          update public.catalogue_import_changes as changes
          set status = 'rejected', resolved_by = ${userId}::uuid, resolved_at = now(),
              resolution_note = 'Superseded by a manual edit.'
          from public.catalogue_import_targets as targets
          where targets.id = changes.target_id
            and targets.item_year_id = ${itemYearId}
            and targets.applied_at is null
            and changes.entry_kind = 'change'
            and changes.status = 'open'
            and changes.field_path = any(${tx.array(editedPaths)}::text[])
        `;
      }
      return { snapshotId, unchanged: false, editedPaths };
    });
  return sql ? work(sql) : withImportDatabaseClient(work);
}

/** Makes a historical snapshot the draft again by copying it as a manual snapshot. */
export async function restoreSnapshot({
  itemYearId,
  snapshotId,
  userId,
  sql,
}: {
  itemYearId: number;
  snapshotId: number;
  userId: string;
  sql?: ImportSql;
}) {
  const work = async (client: ImportSql) => {
    const write = await readSnapshotWrite(client, snapshotId);
    if (!write)
      throw new ManualSnapshotError("The snapshot does not exist.", "P0002");
    const [itemYear] = await client`
      select draft_snapshot_id, published_snapshot_id from public.catalogue_item_years where id = ${itemYearId}
    `;
    if (!itemYear)
      throw new ManualSnapshotError("The record does not exist.", "P0002");
    const baseSnapshotId =
      itemYear.draft_snapshot_id === null
        ? itemYear.published_snapshot_id === null
          ? null
          : Number(itemYear.published_snapshot_id)
        : Number(itemYear.draft_snapshot_id);
    return saveManualSnapshot({
      itemYearId,
      baseSnapshotId,
      write,
      userId,
      sql: client,
    });
  };
  return sql ? work(sql) : withImportDatabaseClient(work);
}
