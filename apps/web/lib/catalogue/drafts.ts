import "server-only";

import type {
  SyncSql,
  SyncTransactionSql,
} from "@/lib/catalogue-sync/sync-store";
import { withSyncDatabaseClient } from "@/lib/catalogue-sync/sync-store";
import { diffSnapshotWrites } from "@/lib/catalogue-import/changes";
import { insertVersionContent } from "@/lib/catalogue-sync/persist-source-version";
import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "@/lib/catalogue-import/version-content";
import {
  CATALOGUE_CONTENT_SCHEMA_VERSION,
  assertStructureVocabulary,
  emptyCatalogueContent,
  validateCatalogueContent,
  type CatalogueContent,
  type CatalogueKind,
} from "@/lib/catalogue/content";

type Sql = SyncSql | SyncTransactionSql;

export type CatalogueDraft = {
  recordId: number;
  baseVersionId: number | null;
  restoredFromVersionId: number | null;
  content: CatalogueContent;
  contentHash: string;
  revision: number;
  updatedAt: string;
};

export class CatalogueDraftError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CatalogueDraftError";
    this.code = code;
  }
}

export class CatalogueDraftConflictError extends CatalogueDraftError {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super(
      "This draft changed elsewhere. Reload before applying more changes.",
      "STALE_DRAFT",
    );
    this.name = "CatalogueDraftConflictError";
    this.currentRevision = currentRevision;
  }
}

function draftFromRow(row: Record<string, unknown>): CatalogueDraft {
  return {
    recordId: Number(row.record_id),
    baseVersionId:
      row.base_version_id === null ? null : Number(row.base_version_id),
    restoredFromVersionId:
      row.restored_from_version_id === null
        ? null
        : Number(row.restored_from_version_id),
    content: validateCatalogueContent(row.content),
    contentHash: String(row.content_hash),
    revision: Number(row.revision),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

function assertEditingSession(editingSessionId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      editingSessionId,
    )
  ) {
    throw new CatalogueDraftError(
      "The editing session is not valid. Reload the page and try again.",
      "INVALID_SESSION",
    );
  }
}

/** Locks one catalogue record so a draft mutation sees a stable lifecycle. */
export async function catalogueRecordForUpdate(sql: Sql, recordId: number) {
  const [record] = await sql`
    select records.id, records.kind, records.academic_year_id,
      records.published_version_id, records.archived_at, codes.code,
      academic_years.year, listings.title as listing_title
    from public.catalogue_records as records
    join public.catalogue_codes as codes on codes.id = records.code_id
    join public.academic_years on academic_years.id = records.academic_year_id
    left join public.catalogue_listings as listings on listings.record_id = records.id
    where records.id = ${recordId}
    for update of records
  `;
  if (!record)
    throw new CatalogueDraftError(
      "The catalogue record does not exist.",
      "NOT_FOUND",
    );
  return record;
}

function assertContentIdentity(
  content: CatalogueContent,
  record: Record<string, unknown>,
) {
  if (
    content.kind !== record.kind ||
    content.code !== record.code ||
    content.academicYear !== Number(record.year)
  ) {
    throw new CatalogueDraftError(
      "The edited content does not belong to this catalogue record.",
      "INVALID_CONTENT",
    );
  }
}

async function copyVersionProvenance(
  sql: Sql,
  recordId: number,
  versionId: number,
) {
  await sql`
    insert into public.catalogue_draft_provenance (
      record_id, field_path, origin, source_version_id, source_evidence_id
    )
    select ${recordId}, evidence.field_path, evidence.method,
      ${versionId}, evidence.id
    from public.catalogue_version_provenance as evidence
    where evidence.version_id = ${versionId}
    on conflict (record_id, field_path) do update set
      origin = excluded.origin,
      source_version_id = excluded.source_version_id,
      source_evidence_id = excluded.source_evidence_id,
      changed_by = null,
      changed_at = now()
  `;
}

/**
 * The aggregate an editor starts from: the current publication, or an empty
 * record when nothing has been published. Reading it writes nothing, so a
 * record can be opened and edited without a draft row coming into existence
 * before there is anything to keep.
 */
export async function catalogueDraftBase(
  sql: Sql,
  record: Record<string, unknown>,
) {
  const publishedVersionId =
    record.published_version_id === null
      ? null
      : Number(record.published_version_id);
  const initial = publishedVersionId
    ? await readVersionContent(sql, publishedVersionId)
    : emptyCatalogueContent({
        kind: record.kind as CatalogueKind,
        code: String(record.code),
        academicYear: Number(record.year),
        title:
          record.listing_title === null ? null : String(record.listing_title),
      });
  if (!initial)
    throw new CatalogueDraftError(
      "The published catalogue version could not be read.",
      "INVALID_BASE",
    );
  const contentHash = contentHashForCatalogueContent(initial);
  return {
    publishedVersionId,
    contentHash,
    content: { ...initial, contentHash } satisfies CatalogueContent,
  };
}

/** The draft-shaped view of a record whose draft row does not exist yet. */
function unsavedDraft(
  recordId: number,
  base: Awaited<ReturnType<typeof catalogueDraftBase>>,
): CatalogueDraft {
  return {
    recordId,
    baseVersionId: base.publishedVersionId,
    restoredFromVersionId: null,
    content: base.content,
    contentHash: base.contentHash,
    revision: 0,
    updatedAt: new Date().toISOString(),
  };
}

/** Creates the draft a record should start from: its publication, or an empty aggregate. */
export async function createDraftInTransaction(
  tx: Sql,
  record: Record<string, unknown>,
  userId: string,
) {
  const { publishedVersionId, contentHash, content } = await catalogueDraftBase(
    tx,
    record,
  );
  const [row] = await tx`
    insert into public.catalogue_drafts (
      record_id, base_version_id, content, content_hash,
      content_schema_version, revision, updated_by
    ) values (
      ${Number(record.id)}, ${publishedVersionId}, ${tx.json(content as never)},
      ${contentHash}, ${CATALOGUE_CONTENT_SCHEMA_VERSION}, 0, ${userId}::uuid
    )
    on conflict (record_id) do nothing
    returning *
  `;
  if (!row) {
    const [existing] = await tx`
      select * from public.catalogue_drafts where record_id = ${Number(record.id)}
    `;
    return draftFromRow(existing);
  }
  if (publishedVersionId)
    await copyVersionProvenance(tx, Number(record.id), publishedVersionId);
  return draftFromRow(row);
}

export async function loadCatalogueDraft(recordId: number) {
  return withSyncDatabaseClient(async (sql) => {
    const [row] = await sql`
      select * from public.catalogue_drafts where record_id = ${recordId}
    `;
    return row ? draftFromRow(row) : null;
  });
}

/**
 * What the content editor opens on, and what state that content is in.
 *
 * A record without a draft row still has content to edit - its publication, or
 * an empty aggregate - so reading a record is not what turns it into a draft.
 * Asking to edit it is, and that is a deliberate act with a row behind it, so
 * the record is still a draft when its editor comes back to it later.
 *
 * Whether the draft says anything new is a separate question from whether one
 * is open, because an untouched draft can be discarded but not published.
 */
export async function loadCatalogueEditorState(
  recordId: number,
  sql?: SyncSql,
): Promise<{
  draft: CatalogueDraft;
  /** Whether a draft row exists: the record is open for editing. */
  hasDraft: boolean;
  /** Whether that draft differs from what it was opened on. */
  hasChanges: boolean;
}> {
  const work = async (client: SyncSql) => {
    const [record] = await client`
      select records.id, records.kind, records.published_version_id,
        codes.code, academic_years.year, listings.title as listing_title
      from public.catalogue_records as records
      join public.catalogue_codes as codes on codes.id = records.code_id
      join public.academic_years on academic_years.id = records.academic_year_id
      left join public.catalogue_listings as listings on listings.record_id = records.id
      where records.id = ${recordId}
    `;
    if (!record)
      throw new CatalogueDraftError(
        "The catalogue record does not exist.",
        "NOT_FOUND",
      );
    const base = await catalogueDraftBase(client, record);
    const [row] = await client`
      select * from public.catalogue_drafts where record_id = ${recordId}
    `;
    if (!row)
      return {
        draft: unsavedDraft(recordId, base),
        hasDraft: false,
        hasChanges: false,
      };
    const draft = draftFromRow(row);
    return {
      draft,
      hasDraft: true,
      hasChanges: draft.contentHash !== base.contentHash,
    };
  };
  return sql ? work(sql) : withSyncDatabaseClient(work);
}

/**
 * Opens a draft on a record without changing a word of it.
 *
 * The editor asks for this when it is opened, so that backing out of it is
 * always the same act - discarding a draft - and so that a record someone has
 * started work on still reads as theirs after they have navigated away.
 */
export async function beginCatalogueDraft({
  recordId,
  userId,
  editingSessionId,
  sql,
}: {
  recordId: number;
  userId: string;
  editingSessionId: string;
  sql?: SyncSql;
}) {
  assertEditingSession(editingSessionId);
  const work = (client: SyncSql) =>
    client.begin(async (tx) => {
      const record = await catalogueRecordForUpdate(tx, recordId);
      if (record.archived_at)
        throw new CatalogueDraftError(
          "The catalogue record is archived.",
          "ARCHIVED",
        );
      const [row] = await tx`
        select * from public.catalogue_drafts where record_id = ${recordId}
        for update
      `;
      const draft = row
        ? draftFromRow(row)
        : await createDraftInTransaction(tx, record, userId);
      return { draft };
    });
  return sql ? work(sql) : withSyncDatabaseClient(work);
}

/** Saves one semantically changed aggregate and its audit rows atomically. */
export async function saveCatalogueDraft({
  recordId,
  expectedRevision,
  content: submitted,
  userId,
  editingSessionId,
  sql,
}: {
  recordId: number;
  expectedRevision: number;
  content: unknown;
  userId: string;
  editingSessionId: string;
  sql?: SyncSql;
}) {
  assertEditingSession(editingSessionId);
  const content = validateCatalogueContent(submitted);
  assertStructureVocabulary(content);
  const work = (client: SyncSql) =>
    client.begin(async (tx) => {
      const record = await catalogueRecordForUpdate(tx, recordId);
      if (record.archived_at)
        throw new CatalogueDraftError(
          "The catalogue record is archived.",
          "ARCHIVED",
        );
      assertContentIdentity(content, record);
      const [draftRow] = await tx`
        select * from public.catalogue_drafts
        where record_id = ${recordId}
        for update
      `;
      const contentHash = contentHashForCatalogueContent(content);
      const accepted = { ...content, contentHash } satisfies CatalogueContent;
      // A record becomes a draft the moment it differs from what it started
      // as, never because its editor autosaved what was already there. Saving
      // an untouched record has to leave it exactly as it was found.
      const base = draftRow ? null : await catalogueDraftBase(tx, record);
      if (base && diffSnapshotWrites(base.content, accepted).length === 0)
        return {
          draft: unsavedDraft(recordId, base),
          unchanged: true as const,
          changedPaths: [] as string[],
        };
      const draft = draftRow
        ? draftFromRow(draftRow)
        : await createDraftInTransaction(tx, record, userId);
      if (draft.revision !== expectedRevision)
        throw new CatalogueDraftConflictError(draft.revision);

      const changes = diffSnapshotWrites(draft.content, accepted);
      if (changes.length === 0)
        return {
          draft,
          unchanged: true as const,
          changedPaths: [] as string[],
        };

      const revision = draft.revision + 1;
      const [updated] = await tx`
        update public.catalogue_drafts
        set content = ${tx.json(accepted as never)}, content_hash = ${contentHash},
          revision = ${revision}, updated_by = ${userId}::uuid, updated_at = now()
        where record_id = ${recordId} and revision = ${expectedRevision}
        returning *
      `;
      if (!updated) throw new CatalogueDraftConflictError(draft.revision);
      const [event] = await tx`
        insert into public.catalogue_change_events (
          record_id, draft_revision, event_kind, origin, actor_id, editing_session_id
        ) values (
          ${recordId}, ${revision}, 'edit', 'manual', ${userId}::uuid,
          ${editingSessionId}::uuid
        ) returning id
      `;
      for (const [position, change] of changes.entries()) {
        await tx`
          insert into public.catalogue_field_changes (
            event_id, position, field_path, old_value, new_value
          ) values (
            ${event.id}, ${position}, ${change.fieldPath},
            ${tx.json(change.oldValue as never)}, ${tx.json(change.newValue as never)}
          )
        `;
        await tx`
          insert into public.catalogue_draft_provenance (
            record_id, field_path, origin, changed_by, changed_at
          ) values (${recordId}, ${change.fieldPath}, 'manual', ${userId}::uuid, now())
          on conflict (record_id, field_path) do update set
            origin = 'manual', source_version_id = null, source_evidence_id = null,
            changed_by = excluded.changed_by, changed_at = excluded.changed_at
        `;
      }
      return {
        draft: draftFromRow(updated),
        unchanged: false as const,
        changedPaths: changes.map((change) => change.fieldPath),
      };
    });
  return sql ? work(sql) : withSyncDatabaseClient(work);
}

async function materialiseDraftVersion(
  tx: SyncTransactionSql,
  {
    record,
    draft,
    userId,
  }: {
    record: Record<string, unknown>;
    draft: CatalogueDraft;
    userId: string;
  },
) {
  const content = validateCatalogueContent(draft.content);
  assertContentIdentity(content, record);
  const contentHash = contentHashForCatalogueContent(content);
  const evidenceRows = await tx`
    select draft.field_path, draft.origin, evidence.confidence,
      evidence.source_locator, evidence.source_excerpt, evidence.source_page_id
    from public.catalogue_draft_provenance as draft
    left join public.catalogue_version_provenance as evidence
      on evidence.id = draft.source_evidence_id
    where draft.record_id = ${draft.recordId}
    order by draft.field_path
  `;
  const write: CatalogueContent = {
    ...content,
    contentHash,
    evidence: evidenceRows.map((row) => ({
      fieldPath: String(row.field_path),
      method: row.origin as "model" | "manual",
      confidence: row.confidence === null ? null : Number(row.confidence),
      sourceLocator:
        row.source_locator === null ? null : String(row.source_locator),
      sourceExcerpt:
        row.source_excerpt === null ? null : String(row.source_excerpt),
    })),
  };
  const [version] = await tx`
    insert into public.catalogue_versions (
      record_id, kind, academic_year_id, origin, based_on_version_id,
      content_hash, created_by
    ) values (
      ${Number(record.id)}, ${String(record.kind)}, ${Number(record.academic_year_id)}, 'manual',
      ${draft.baseVersionId}, ${contentHash}, ${userId}::uuid
    ) returning id
  `;
  const versionId = Number(version.id);
  await insertVersionContent(tx, {
    snapshotId: versionId,
    kind: content.kind,
    academicYearId: Number(record.academic_year_id),
    sourcePageId: null,
    write,
  });
  await tx`
    update public.catalogue_version_provenance as published
    set source_page_id = source.source_page_id,
        source_document_id = source.source_document_id
    from public.catalogue_draft_provenance as draft
    join public.catalogue_version_provenance as source
      on source.id = draft.source_evidence_id
    where published.version_id = ${versionId}
      and draft.record_id = ${draft.recordId}
      and published.field_path = draft.field_path
  `;
  await tx`
    update public.catalogue_versions
    set sealed_at = greatest(statement_timestamp(), created_at)
    where id = ${versionId}
  `;
  return versionId;
}

export async function publishCatalogueDraft({
  recordId,
  expectedRevision,
  userId,
  editingSessionId,
  sql,
}: {
  recordId: number;
  expectedRevision: number;
  userId: string;
  editingSessionId: string;
  sql?: SyncSql;
}) {
  assertEditingSession(editingSessionId);
  const work = (client: SyncSql) =>
    client.begin(async (tx) => {
      const record = await catalogueRecordForUpdate(tx, recordId);
      if (record.archived_at)
        throw new CatalogueDraftError(
          "Archived records cannot be published.",
          "ARCHIVED",
        );
      const [row] = await tx`
        select * from public.catalogue_drafts where record_id = ${recordId} for update
      `;
      if (!row)
        throw new CatalogueDraftError(
          "There is no draft to publish.",
          "NO_DRAFT",
        );
      const draft = draftFromRow(row);
      if (draft.revision !== expectedRevision)
        throw new CatalogueDraftConflictError(draft.revision);
      const publishedContent = record.published_version_id
        ? await readVersionContent(tx, Number(record.published_version_id))
        : null;
      if (
        publishedContent &&
        diffSnapshotWrites(publishedContent, draft.content).length === 0
      ) {
        throw new CatalogueDraftError(
          "The draft has no unpublished changes.",
          "UNCHANGED_DRAFT",
        );
      }
      const versionId = await materialiseDraftVersion(tx, {
        record,
        draft,
        userId,
      });
      await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
      await tx`
        update public.catalogue_records
        set published_version_id = ${versionId}, updated_at = now()
        where id = ${recordId}
      `;
      await tx`
        insert into public.catalogue_change_events (
          record_id, draft_revision, event_kind, origin, actor_id,
          editing_session_id, version_id
        ) values (
          ${recordId}, ${draft.revision}, 'publish', 'manual', ${userId}::uuid,
          ${editingSessionId}::uuid, ${versionId}
        )
      `;
      await tx`delete from public.catalogue_drafts where record_id = ${recordId}`;
      return { versionId };
    });
  return sql ? work(sql) : withSyncDatabaseClient(work);
}

export async function unpublishCatalogueRecord({
  recordId,
  userId,
  editingSessionId,
  sql,
}: {
  recordId: number;
  userId: string;
  editingSessionId: string;
  sql?: SyncSql;
}) {
  assertEditingSession(editingSessionId);
  const work = (client: SyncSql) =>
    client.begin(async (tx) => {
      const record = await catalogueRecordForUpdate(tx, recordId);
      if (record.published_version_id === null)
        throw new CatalogueDraftError(
          "The record is not published.",
          "NOT_PUBLISHED",
        );
      const versionId = Number(record.published_version_id);
      await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
      await tx`
        update public.catalogue_records
        set published_version_id = null, updated_at = now()
        where id = ${recordId}
      `;
      await tx`
        insert into public.catalogue_change_events (
          record_id, event_kind, origin, actor_id, editing_session_id, version_id
        ) values (
          ${recordId}, 'unpublish', 'manual', ${userId}::uuid,
          ${editingSessionId}::uuid, ${versionId}
        )
      `;
      return { versionId };
    });
  return sql ? work(sql) : withSyncDatabaseClient(work);
}

async function draftIsMeaningful(
  tx: Sql,
  record: Record<string, unknown>,
  draft: CatalogueDraft,
) {
  if (draft.baseVersionId) {
    const base = await readVersionContent(tx, draft.baseVersionId);
    return !base || diffSnapshotWrites(base, draft.content).length > 0;
  }
  const empty = emptyCatalogueContent({
    kind: record.kind as CatalogueKind,
    code: String(record.code),
    academicYear: Number(record.year),
    title: record.listing_title === null ? null : String(record.listing_title),
  });
  return contentHashForCatalogueContent(empty) !== draft.contentHash;
}

export async function discardCatalogueDraft({
  recordId,
  expectedRevision,
  userId,
  editingSessionId,
  sql,
}: {
  recordId: number;
  expectedRevision: number;
  userId: string;
  editingSessionId: string;
  sql?: SyncSql;
}) {
  assertEditingSession(editingSessionId);
  const work = (client: SyncSql) =>
    client.begin(async (tx) => {
      const record = await catalogueRecordForUpdate(tx, recordId);
      const [row] = await tx`
        select * from public.catalogue_drafts where record_id = ${recordId} for update
      `;
      if (!row)
        throw new CatalogueDraftError(
          "There is no draft to discard.",
          "NO_DRAFT",
        );
      const draft = draftFromRow(row);
      if (draft.revision !== expectedRevision)
        throw new CatalogueDraftConflictError(draft.revision);
      const meaningful = await draftIsMeaningful(tx, record, draft);
      let checkpointVersionId: number | null = null;
      if (meaningful) {
        checkpointVersionId = await materialiseDraftVersion(tx, {
          record,
          draft,
          userId,
        });
        await tx`
          insert into public.catalogue_change_events (
            record_id, draft_revision, event_kind, origin, actor_id,
            editing_session_id, version_id
          ) values (
            ${recordId}, ${draft.revision}, 'discard', 'manual', ${userId}::uuid,
            ${editingSessionId}::uuid, ${checkpointVersionId}
          )
        `;
      }
      await tx`delete from public.catalogue_drafts where record_id = ${recordId}`;
      return { checkpointVersionId, meaningful };
    });
  return sql ? work(sql) : withSyncDatabaseClient(work);
}

export async function restoreCatalogueVersion({
  recordId,
  versionId,
  expectedRevision,
  replaceExistingDraft,
  userId,
  editingSessionId,
  sql,
}: {
  recordId: number;
  versionId: number;
  expectedRevision: number | null;
  replaceExistingDraft: boolean;
  userId: string;
  editingSessionId: string;
  sql?: SyncSql;
}) {
  assertEditingSession(editingSessionId);
  const work = (client: SyncSql) =>
    client.begin(async (tx) => {
      const record = await catalogueRecordForUpdate(tx, recordId);
      const content = await readVersionContent(tx, versionId);
      if (!content)
        throw new CatalogueDraftError(
          "The catalogue version does not exist.",
          "NOT_FOUND",
        );
      assertContentIdentity(content, record);
      const [existingRow] = await tx`
        select * from public.catalogue_drafts where record_id = ${recordId} for update
      `;
      const existing = existingRow ? draftFromRow(existingRow) : null;
      let replacedVersionId: number | null = null;
      if (existing) {
        if (!replaceExistingDraft)
          throw new CatalogueDraftError(
            "Confirm that the current draft should be replaced.",
            "CONFIRM_REPLACE",
          );
        if (expectedRevision === null || existing.revision !== expectedRevision)
          throw new CatalogueDraftConflictError(existing.revision);
        // Restoring must not destroy work. The draft it replaces becomes a
        // version of its own, so the changelog can offer it back.
        if (await draftIsMeaningful(tx, record, existing)) {
          replacedVersionId = await materialiseDraftVersion(tx, {
            record,
            draft: existing,
            userId,
          });
          await tx`
            insert into public.catalogue_change_events (
              record_id, draft_revision, event_kind, origin, actor_id,
              editing_session_id, version_id
            ) values (
              ${recordId}, ${existing.revision}, 'discard', 'manual',
              ${userId}::uuid, ${editingSessionId}::uuid, ${replacedVersionId}
            )
          `;
        }
      }
      const revision = existing ? existing.revision + 1 : 0;
      const contentHash = contentHashForCatalogueContent(content);
      const restored = { ...content, contentHash } satisfies CatalogueContent;
      await tx`
        insert into public.catalogue_drafts (
          record_id, base_version_id, restored_from_version_id, content,
          content_hash, content_schema_version, revision, updated_by
        ) values (
          ${recordId}, ${versionId}, ${versionId}, ${tx.json(restored as never)},
          ${contentHash}, ${CATALOGUE_CONTENT_SCHEMA_VERSION}, ${revision}, ${userId}::uuid
        )
        on conflict (record_id) do update set
          base_version_id = excluded.base_version_id,
          restored_from_version_id = excluded.restored_from_version_id,
          content = excluded.content,
          content_hash = excluded.content_hash,
          content_schema_version = excluded.content_schema_version,
          revision = excluded.revision,
          updated_by = excluded.updated_by,
          updated_at = now()
      `;
      await tx`
        delete from public.catalogue_draft_provenance where record_id = ${recordId}
      `;
      await copyVersionProvenance(tx, recordId, versionId);
      await tx`
        insert into public.catalogue_change_events (
          record_id, draft_revision, event_kind, origin, actor_id,
          editing_session_id, version_id
        ) values (
          ${recordId}, ${revision}, 'restore', 'manual', ${userId}::uuid,
          ${editingSessionId}::uuid, ${versionId}
        )
      `;
      return { revision, content: restored, replacedVersionId };
    });
  return sql ? work(sql) : withSyncDatabaseClient(work);
}
