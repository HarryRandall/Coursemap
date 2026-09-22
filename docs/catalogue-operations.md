# Catalogue operations

How administrators check ANU source material and publish Coursemap catalogue
records. The same workflow applies to courses, programmes, majors, minors and
specialisations.

## Concepts

- **Record**: one code in one academic year, for example COMP1100 in 2026.
- **Source version**: an immutable projection of ANU material captured by one
  record sync. It never becomes student-visible automatically.
- **Draft**: the private mutable content being prepared by an administrator.
- **Published version**: the immutable version students can see.

Publication state and ANU source state are independent. A record can be
published while newer ANU changes are waiting for review.

## Discover and sync a record

1. Open the catalogue kind under **Admin**, choose the academic year and use
   **Refresh ANU listing**. Discovery creates immediately openable records but
   does not fetch their detailed content.
2. Open one record and choose **Sync from ANU**. Exactly one sync is created for
   that record. The action is disabled while it is queued or running.
3. The result is one of:
   - **Up to date**: the semantic source content is unchanged. The check time
     and source evidence are retained without creating another source version.
   - **Changes available**: a new immutable source version exists. Local draft
     and published content remain unchanged.
   - **Applied**: on the first sync only, an otherwise empty record is populated
     as a draft. It is still not published.
   - **Sync failed**: the error is retained and the record can be retried.

A first sync does not overwrite meaningful manual or published content. In
that case it behaves like a later changed sync and leaves the source version
available for the later source-review workflow.

## Edit, preview and publish

The **Content** tab edits the record's draft. Saving checks the expected draft
revision so a stale browser tab cannot overwrite newer work. Manual edits
preserve source provenance for untouched paths and replace it for changed
paths.

**Preview** renders the draft, or the published version when there is no draft,
using the student-facing view. **Publish draft** materialises and seals a new
manual version, advances the publication pointer and clears the draft.
**Unpublish** closes the visibility interval without deleting history.

The **History** tab lists immutable versions and publication events.
**Restore as draft** copies historical content into a new draft. **Discard**
clears the draft without deleting versions.

## Reliability and evidence

Each sync records immutable fetched source material, stage artefacts, parser and
model versions, validation results and model usage. Identical valid extraction
inputs can reuse the stored response. Queue workers claim one record with a
lease; expired work is retryable up to five attempts, terminal completion is
lease-checked, and cancellation prevents unfinished work from completing.

Local development processes syncs after the request using the local database.
Hosted environments set `COURSEMAP_SYNC_DATABASE_URL` and
`COURSEMAP_QUEUE_SYNCS_ENABLED=true`; the queue topic is
`catalogue-sync-v1`. See `apps/web/.env.example`.
