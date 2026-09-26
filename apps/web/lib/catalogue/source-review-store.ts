import type {
  SyncSql,
  SyncTransactionSql,
} from "../catalogue-sync/sync-store.ts";
import { withSyncDatabaseClient } from "../catalogue-sync/sync-store.ts";
import { fieldLabel } from "../coursemap/catalogue-kinds.ts";
import type { CatalogueContent } from "./content.ts";
import {
  type CatalogueReviewUnitKind,
  catalogueReviewUnitMap,
} from "./review-units.ts";
import { type FirstReadBand, classifyFirstRead } from "./first-read.ts";
import {
  type SourceChangeClassification,
  classifySourceReview,
  reclassifyAgainstDraft,
  reviewValueHash,
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
  /** A first reading's weakest confidence, band and reason; null otherwise. */
  confidence: number | null;
  band: FirstReadBand | null;
  reason: string | null;
};

export type SourceReview = {
  syncId: string;
  sourceVersionId: number | null;
  generatedAt: string;
  conflicts: SourceReviewChange[];
  incoming: SourceReviewChange[];
  overrides: SourceReviewChange[];
  /** Open parts of a record's first reading from ANU, least certain first. */
  firstRead: SourceReviewChange[];
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
    confidence: row.confidence === null ? null : Number(row.confidence),
    band:
      row.review_band === null
        ? null
        : (String(row.review_band) as FirstReadBand),
    reason: row.review_reason === null ? null : String(row.review_reason),
  };
}

const BAND_ORDER: Record<FirstReadBand, number> = {
  needs_review: 0,
  check: 1,
  accepted: 2,
};

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
      firstRead: open("first_read").sort(
        (left, right) =>
          BAND_ORDER[left.band ?? "accepted"] -
            BAND_ORDER[right.band ?? "accepted"] ||
          (left.confidence ?? 0) - (right.confidence ?? 0),
      ),
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

/**
 * Records a record's first reading from ANU for review. The draft already
 * holds the reading, so every row starts equal to the draft; approving one
 * keeps the value, and correcting it in the editor shows as an edit.
 */
export async function generateFirstReadReview(
  tx: SyncTransactionSql,
  {
    syncId,
    recordId,
    content,
  }: { syncId: string; recordId: number; content: CatalogueContent },
) {
  const items = classifyFirstRead(content);
  await tx`
    update public.catalogue_sync_changes set superseded_at = now()
    where record_id = ${recordId} and superseded_at is null
  `;
  for (const [position, item] of items.entries()) {
    await tx`
      insert into public.catalogue_sync_changes (
        sync_id, record_id, field_path, review_unit_kind, classification,
        base_source_value, local_value, incoming_source_value, local_value_hash,
        position, confidence, review_band, review_reason
      ) values (
        ${syncId}::uuid, ${recordId}, ${item.fieldPath}, ${item.unitKind},
        'first_read', null, ${tx.json(item.value as never)},
        ${tx.json(item.value as never)}, ${reviewValueHash(item.value)},
        ${position}, ${item.confidence}, ${item.band}, ${item.reason}
      )
    `;
  }
  return {
    total: items.length,
    needsReview: items.filter((item) => item.band === "needs_review").length,
  };
}

/** How many parts of a first reading still wait on a person before publishing. */
export async function countBlockingFirstReads(
  sql: SyncSql | SyncTransactionSql,
  recordId: number,
) {
  const [row] = await sql`
    select count(*)::int as count from public.catalogue_sync_changes
    where record_id = ${recordId} and superseded_at is null
      and decision is null and review_band = 'needs_review'
  `;
  return Number(row?.count ?? 0);
}
