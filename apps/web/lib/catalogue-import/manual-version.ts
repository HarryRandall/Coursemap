import { diffSnapshotWrites } from "./changes.ts";
import { type ImportSql, withImportDatabaseClient } from "./import-store.ts";
import { insertVersionContent } from "./persist-version.ts";
import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "./version-content.ts";
import type { CatalogueContent } from "../catalogue/content.ts";

export class ManualSnapshotError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ManualSnapshotError";
    this.code = code;
  }
}

/**
 * Saves edited content as a new manual version based on the version the
 * editor started from. Open review changes on the edited fields close as
 * rejected, since the administrator has decided the value directly.
 */
export async function saveManualVersion({
  recordId,
  baseSnapshotId,
  write,
  userId,
  sql,
}: {
  recordId: number;
  baseSnapshotId: number | null;
  write: CatalogueContent;
  userId: string;
  sql?: ImportSql;
}) {
  const work = async (client: ImportSql) =>
    client.begin(async (tx) => {
      const [itemYear] = await tx`
        select item_years.id, item_years.kind, item_years.academic_year_id,
          item_years.archived_at, items.code, academic_years.year,
          current_version.id as current_version_id
        from public.catalogue_records as item_years
        join public.catalogue_codes as items on items.id = item_years.code_id
        join public.academic_years on academic_years.id = item_years.academic_year_id
        left join lateral (
          select versions.id
          from public.catalogue_versions as versions
          left join public.catalogue_import_targets as targets
            on targets.id = versions.import_target_id
          where versions.record_id = item_years.id
            and versions.sealed_at is not null
            and (
              versions.import_target_id is null
              or targets.applied_version_id = versions.id
            )
          order by versions.created_at desc, versions.id desc
          limit 1
        ) as current_version on true
        where item_years.id = ${recordId}
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
        itemYear.current_version_id === null
          ? null
          : Number(itemYear.current_version_id);
      if (currentBase !== baseSnapshotId) {
        throw new ManualSnapshotError(
          "The record changed while you were editing. Reload and apply your changes again.",
          "STALE_BASE",
        );
      }

      const baseWrite = baseSnapshotId
        ? await readVersionContent(tx, baseSnapshotId)
        : null;
      const contentHash = contentHashForCatalogueContent(write);
      if (
        baseWrite &&
        contentHashForCatalogueContent(baseWrite) === contentHash
      ) {
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
        insert into public.catalogue_versions (
          record_id, kind, academic_year_id, origin, based_on_version_id, content_hash, created_by
        ) values (
          ${recordId}, ${itemYear.kind}, ${itemYear.academic_year_id}, 'manual', ${baseSnapshotId},
          ${contentHash}, ${userId}::uuid
        ) returning id
      `;
      const snapshotId = Number(snapshot.id);
      await insertVersionContent(tx, {
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
      await tx`
        update public.catalogue_versions
        set sealed_at = greatest(statement_timestamp(), created_at)
        where id = ${snapshotId}
      `;

      if (editedPaths.length > 0) {
        await tx`
          update public.catalogue_import_changes as changes
          set status = 'rejected', resolved_by = ${userId}::uuid, resolved_at = now(),
              resolution_note = 'Superseded by a manual edit.'
          from public.catalogue_import_targets as targets
          where targets.id = changes.target_id
            and targets.record_id = ${recordId}
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

/** Restores historical content by copying it into a new manual version. */
export async function restoreSnapshot({
  recordId,
  snapshotId,
  userId,
  sql,
}: {
  recordId: number;
  snapshotId: number;
  userId: string;
  sql?: ImportSql;
}) {
  const work = async (client: ImportSql) => {
    const write = await readVersionContent(client, snapshotId);
    if (!write)
      throw new ManualSnapshotError("The snapshot does not exist.", "P0002");
    const [itemYear] = await client`
      select versions.id as current_version_id
      from public.catalogue_records as records
      left join lateral (
        select versions.id
        from public.catalogue_versions as versions
        left join public.catalogue_import_targets as targets
          on targets.id = versions.import_target_id
        where versions.record_id = records.id
          and versions.sealed_at is not null
          and (
            versions.import_target_id is null
            or targets.applied_version_id = versions.id
          )
        order by versions.created_at desc, versions.id desc
        limit 1
      ) as versions on true
      where records.id = ${recordId}
    `;
    if (!itemYear)
      throw new ManualSnapshotError("The record does not exist.", "P0002");
    const baseSnapshotId =
      itemYear.current_version_id === null
        ? null
        : Number(itemYear.current_version_id);
    return saveManualVersion({
      recordId,
      baseSnapshotId,
      write,
      userId,
      sql: client,
    });
  };
  return sql ? work(sql) : withImportDatabaseClient(work);
}
