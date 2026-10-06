# Catalogue operations

How administrators check ANU source material and publish Coursemap catalogue
records. The same workflow applies to courses, programmes, majors, minors and
specialisations.

Public pages are year-first: `/courses/2027/comp2700`, `/programmes/2027/...`
and the same for majors, minors and specialisations. They resolve published
immutable versions only. No public read reaches a draft, a newer unpublished
version or an ANU source version.

## Concepts

- **Record**: one code in one academic year, for example COMP1100 in 2026.
- **Source version**: an immutable projection of ANU material captured by one
  record sync. It never becomes student-visible automatically.
- **Draft**: the private mutable content being prepared by an administrator.
- **Published version**: the immutable version students can see.

Publication state and ANU source state are independent. A record can be
published while newer ANU changes are waiting for review.

## Discover and sync a record

The admin year picker offers all registered years from 2020 to 2030, including
years whose ANU listing has not been refreshed yet. Choose a year and use
**Refresh ANU listing** to discover its records.

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

Course imports resolve programme names against current ANU directory identities
for the selected year. Relevant names and codes enter the saved model input.
An exact name identifying one code can be normalised before validation, with
the resolution recorded in the validation report. Similar titles and ambiguous
names are never guessed. Refresh that year's programme listing when a referenced
programme is missing.

Requirement confidence comes from model evidence, not a default percentage.
Separate conditions may quote the same sentence without needing review; repeated
conditions within the same group are flagged instead.

A bare ANU clause such as 'Incompatible with COMP1100' covers completed and
concurrent enrolment. The importer adds concurrent scope only for a simple
code list already extracted as hard completed-course exclusions, and records
the correction for review. Conditional wording or uncertain exclusions remain
blocked for individual review.
Course finalisation independently checks plain mixed AND/OR prerequisite
sentences without explicit scope markers. A guessed rule for such a sentence is
withheld, the exact source wording is retained as an unknown requirement, and
publication is blocked for review even if the model reported full confidence.
This safeguard is conservative; it does not establish the correctness of every
other requirement.

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

Rules that the visual editor cannot represent offer a recorded JSON editor.
Supported rules also offer **Edit recorded rule**, closed by default. Check the
exact-year ANU page, edit that rule's groups, conditions, options and optional
reference index, then choose **Apply corrected rule**. Typing JSON does not
save. Invalid rows, cross-rule references and a rule changed during editing are
rejected. **Reset recorded rule** loads its current rows. Applying uses the
normal draft autosave and preserves other rules and record fields; it does not
publish or clear existing review flags. Omitting `references` preserves the
recorded reference index.

Autosave keeps open sections and later typing in place. Record tabs wait for
saving to finish, and removing a collection's final item is still a saved
manual change. Editing source wording preserves the existing requirement
conditions and their scopes.

Incomplete unit options can be saved in a draft. Publication requires a
positive number of units, a label or a cleared label field, and the ANU source
wording; a missing value is reported before a new version is created.

**Student view** answers what students will read. It shows the draft first,
because the question being asked is what publishing would do, and offers
**Published** beside it when a publication exists. With no draft it shows the
publication; with no publication it shows the draft and says students see
nothing yet. Both sides render through the same components and the same content
projection as the public page, so a preview cannot quietly drift from what a
student gets.

**Publish draft** materialises and seals a new manual version, advances the
publication pointer and clears the draft. **Unpublish** closes the visibility
interval without deleting history. Both drop the cached public reads for that
record, so the public page never serves the previous version after the change.

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

## Operations and diagnostics

`/admin/operations/catalogue` is the developer surface, behind the
`imports.manage` permission rather than the permission to author content. It
holds the technical statuses, attempts, leases, model responses and costs that
the record pages deliberately do not show.

- **Syncs** lists every ANU check with its record, status, trigger, duration,
  model and cost, searchable by code and filterable by status. One sync opens
  to its stages and attempts, its lease and queue detail, its source document,
  its extractions with tokens and cost, and every stored artefact from raw HTML
  through to the projected content.
- **Discovery** lists ANU listing checks with what each read and concluded. A
  check that is not complete cannot retire a record, which is the answer to why
  something does or does not say "No longer listed by ANU".

A record page links out to its diagnostics and, on a failure, to the technical
detail behind it. Diagnostics never become a record tab.

Notifications name records: "COMP2700 sync failed", or "COMP2700 has 3 ANU
changes to review", addressed to whoever asked for the sync. A sync that found
nothing, and a review with nothing to decide, say nothing at all.

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

## Limit a bulk import to named codes

The import setup's **Only these codes** field accepts comma- or space-separated
catalogue codes. Blank includes all eligible missing records for the selected
year and kind. A supplied list narrows both the preview count and creation query
before the record limit is applied. Codes are normalised and deduplicated;
invalid or explicitly empty lists are rejected. Existing imported records,
drafts and active syncs remain excluded. Saved run items retain the selection
when the run resumes. The code filter does not alter AI or publication choices.
