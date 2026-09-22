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
for review.

## Review ANU changes

The **Changes** tab compares three states for every review unit: the previous
ANU value, the current local value and the new ANU value. The comparison is
kept three-sided because collapsing it loses the difference between an ordinary
ANU update and a genuine conflict.

| Previous ANU | Local | New ANU | Shown as                |
| ------------ | ----- | ------- | ----------------------- |
| A            | A     | A       | nothing                 |
| A            | B     | A       | Kept different from ANU |
| A            | A     | C       | Incoming from ANU       |
| A            | B     | C       | Conflict                |
| A            | C     | C       | nothing                 |

A review unit is one scalar field, one requirement rule, or one whole
collection such as assessment or offerings. Collections review whole because
their rows have no stable identity to merge on.

Decisions are immediate and act on one unit:

- **Use ANU** writes that path into the draft, records the change and moves
  that path's provenance to the source version. No other path is touched.
- **Keep current** resolves the row and leaves the draft alone.

Keeping a value is durable. The record's ANU baseline advances with every
source version, so the same ANU value classifies as a local override on the
next sync and raises nothing. If ANU changes again, a fresh conflict appears.

Editing an unrelated field never blocks a decision. Editing the same field
after the review was generated turns that row into a conflict, so the values
on screen are the ones actually in play. A newer sync supersedes the open
review and preserves the decisions already taken.

## Edit, preview and publish

The **Content** tab edits the record's draft. Saving checks the expected draft
revision so a stale browser tab cannot overwrite newer work. Manual edits
preserve source provenance for untouched paths and replace it for changed
paths.

**Preview** renders the draft, or the published version when there is no draft,
using the student-facing view. **Publish draft** materialises and seals a new
manual version, advances the publication pointer and clears the draft.
**Unpublish** closes the visibility interval without deleting history.

## Read the changelog

The **Changelog** tab is one timeline of everything that happened to the
record, newest first and grouped by day. It speaks in editing, review and
publication terms; technical execution detail belongs to operations, not here.

Autosaves are grouped by editing session, so one sitting reads as "Harry edited
Description, 5 autosaves over 4 minutes" with the value it started from and the
value it ended on. A field typed and taken back within a session is not a
change. Repeated quiet ANU checks collapse into one line. The grouping is
presentation only: every raw event keeps its own row, and expanding an entry
shows the fields it covers.

Versions are numbered within their record and open as a page, not a database
row. A version page renders the student view of that content and offers
**Compare** against the current draft, the published version or the preceding
version, and **Restore as draft**.

**Restore as draft** copies historical content into the working draft. It is
not called a revert because the version itself never changes. If a draft would
be replaced, the draft is kept as a version of its own first and offered back
from the changelog, so nothing is lost. **Discard** works the same way: it
clears the draft and keeps a restorable checkpoint.

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
