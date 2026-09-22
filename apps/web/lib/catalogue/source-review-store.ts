import type { SyncTransactionSql } from "../catalogue-sync/sync-store.ts";
import { withSyncDatabaseClient } from "../catalogue-sync/sync-store.ts";
import { fieldLabel } from "../coursemap/catalogue-kinds.ts";
import type { CatalogueContent } from "./content.ts";
import {
  type CatalogueReviewUnitKind,
  catalogueReviewUnitMap,
} from "./review-units.ts";
import {
  type SourceChangeClassification,
  classifySourceReview,
  reclassifyAgainstDraft,
} from "./source-review.ts";

export type SourceReviewDecision = "use_source" | "keep_local";

export type SourceReviewChange = {
  id: number;
  fieldPath: string;
  label: string;
  unitKind: CatalogueReviewUnitKind;
  classification: SourceChangeClassification;
  hasBaseSource: boolean;
  baseSourceValue: unknown;
  localValue: unknown;
  incomingSourceValue: unknown;
  /** True when the draft moved at this path after the review was generated. */
  isStale: boolean;
  decision: SourceReviewDecision | null;
  resolvedAt: string | null;
};

export type SourceReview = {
  syncId: string;
  sourceVersionId: number | null;
  generatedAt: string;
  conflicts: SourceReviewChange[];
  incoming: SourceReviewChange[];
  overrides: SourceReviewChange[];
  resolved: SourceReviewChange[];
};

function changeFromRow(
  row: Record<string, unknown>,
  draft: CatalogueContent | null,
): SourceReviewChange {
  const stored = {
    classification: String(row.classification) as SourceChangeClassification,
    baseSourceValue: row.base_source_value ?? null,
    localValue: row.local_value ?? null,
    incomingSourceValue: row.incoming_source_value ?? null,
    localValueHash: String(row.local_value_hash),
  };
  const draftValue =
    catalogueReviewUnitMap(draft).get(String(row.field_path))?.value ?? null;
  const live = reclassifyAgainstDraft(stored, draftValue);
  return {
    id: Number(row.id),
    fieldPath: String(row.field_path),
    label: fieldLabel(String(row.field_path)),
    unitKind: String(row.review_unit_kind) as CatalogueReviewUnitKind,
    classification: live.classification,
    hasBaseSource: row.previous_source_version_id !== null,
    baseSourceValue: stored.baseSourceValue,
    localValue: live.localValue,
    incomingSourceValue: stored.incomingSourceValue,
    isStale: live.isStale,
    decision:
      row.decision === null
        ? null
        : (String(row.decision) as SourceReviewDecision),
    resolvedAt:
      row.resolved_at === null
        ? null
        : new Date(row.resolved_at as string | Date).toISOString(),
  };
}

/**
 * The record's one current review, reclassified against the draft as it
 * stands. Returns null when no sync has ever produced changes for it.
 */
export async function loadSourceReview(
  recordId: number,
  draft: CatalogueContent | null,
): Promise<SourceReview | null> {
  return withSyncDatabaseClient(async (sql) => {
    const rows = await sql`
      select changes.*, versions.id as source_version_id,
        versions.based_on_version_id as previous_source_version_id
      from public.catalogue_sync_changes as changes
      join public.catalogue_versions as versions on versions.sync_id = changes.sync_id
      where changes.record_id = ${recordId} and changes.superseded_at is null
      order by changes.position
    `;
    if (rows.length === 0) return null;
    const changes = rows.map((row) => changeFromRow(row, draft));
    const open = (classification: SourceChangeClassification) =>
      changes.filter(
        (change) =>
          change.decision === null && change.classification === classification,
      );
    return {
      syncId: String(rows[0].sync_id),
      sourceVersionId:
        rows[0].source_version_id === null
          ? null
          : Number(rows[0].source_version_id),
      generatedAt: new Date(rows[0].created_at as string | Date).toISOString(),
      conflicts: open("conflict"),
      incoming: open("source_change"),
      overrides: open("local_override"),
      resolved: changes.filter((change) => change.decision !== null),
    } satisfies SourceReview;
  });
}

/**
 * Replaces the record's current review with the comparison this sync found.
 * Earlier rows are superseded rather than deleted, so their decisions stay
 * readable in the Changelog. Converged units are classified but not stored:
 * nobody has to answer a change the record already carries.
 */
export async function generateSourceReview(
  tx: SyncTransactionSql,
  {
    syncId,
    recordId,
    baseSource,
    local,
    incomingSource,
  }: {
    syncId: string;
    recordId: number;
    baseSource: CatalogueContent | null;
    local: CatalogueContent | null;
    incomingSource: CatalogueContent;
  },
) {
  const classified = classifySourceReview({
    baseSource,
    local,
    incomingSource,
  });
  const changes = classified.filter(
    (change) => change.classification !== "converged",
  );
  await tx`
    update public.catalogue_sync_changes set superseded_at = now()
    where record_id = ${recordId} and superseded_at is null
  `;
  for (const change of changes) {
    await tx`
      insert into public.catalogue_sync_changes (
        sync_id, record_id, field_path, review_unit_kind, classification,
        base_source_value, local_value, incoming_source_value, local_value_hash,
        position
      ) values (
        ${syncId}::uuid, ${recordId}, ${change.fieldPath}, ${change.unitKind},
        ${change.classification}, ${tx.json(change.baseSourceValue as never)},
        ${tx.json(change.localValue as never)},
        ${tx.json(change.incomingSourceValue as never)},
        ${change.localValueHash}, ${change.position}
      )
    `;
  }
  return {
    total: changes.length,
    conflictCount: changes.filter(
      (change) => change.classification === "conflict",
    ).length,
    actionableCount: changes.filter(
      (change) =>
        change.classification === "conflict" ||
        change.classification === "source_change",
    ).length,
  };
}
