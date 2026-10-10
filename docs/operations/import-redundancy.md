# Import redundancy and database growth

The owner's read-only production follow-up on 10 October 2026 reports 105,730
sync-change rows: 104,972 current, 758 superseded, and only 29 superseded and
decided. All were created within 30 days. None of the 39,671 import-bucket
objects matched a sync finished more than 30 days ago. The existing age-based
retention tool therefore offers little immediate capacity relief. These facts
come from the supplied `/tmp/prod-followup.md`, not a new production query.

This assessment leaves every retention protection unchanged. No recent/current
row, version child, published provenance, source body, extraction dependency,
audit reference or live run becomes deletable because its value is duplicated.
Representation changes can avoid writing duplicate bytes while retaining those
records and meanings. That is distinct from approving a new cleanup category.

## Savings estimates

The supplied relation sizes include indexes, TOAST, page overhead and possible
bloat. Use these figures only as an amortised growth estimate. A deleted row
makes space reusable; it does not promise a matching immediate reduction in the
reported database size. Storage payload is outside the database quota.

`A = 111,157,248 / 39,671 = 2,802 bytes/object` is the rough Storage database
allocation per import object, assuming this bucket dominates the relation.
Of that, about 781 bytes is table/TOAST allocation and 2,021 bytes is index
allocation. The sizing SQL lists every bucket and index to test that assumption.
`C = 125,673,472 / 105,730 = 1,189 bytes/change` similarly includes about 996
bytes table/TOAST and 193 bytes indexes per change. These are allocation averages,
not measurements of individual tuples.

| Opportunity                                                 | Estimate and measurement                                                                                                                                                                                                                                                                     | Safety and delivery                                                                                                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identical reused model-response objects                     | `R × A` database allocation avoided, about **2.67 MiB per 1,000 reuses**, plus `sum(response byte_size)` payload. Existing same-byte copies are measured as `reused_response_equal_byte_copies`.                                                                                             | **Forward change implemented.** Keep the new sync's artefact row and extraction reference, sharing only verified byte-identical immutable object bytes. Immediate existing-data saving: **0**.                                     |
| Other equal-hash object copies, including repeated raw HTML | `D × A` allocation plus duplicate payload; SQL returns per-kind duplicate object counts, `pg_column_size(object)` sums and payload bytes.                                                                                                                                                    | Existing referenced bodies stay. Repointing old immutable artefact rows would need a separate schema/API design and migration. No cleanup category added. Hash/size matches are a sizing filter, not verification of actual bytes. |
| Model input repeated inside the model request               | Potentially one fewer object per successful attempt: **2.67 MiB per 1,000 attempts**, plus the input payload and any artefact-row allocation eliminated. SQL's `model_input` inventory gives actual counts and payload.                                                                      | Deferred forward change. The exact input is `request.messages[1].content`, but failures before request persistence currently retain the separate input. A derived viewer must preserve that diagnostic fallback.                   |
| Pack four diagnostic outputs into one object                | Combining Markdown, model input, validation report and content projection could avoid three objects per complete sync: roughly **8.02 MiB per 1,000 syncs**. Payload is approximately unchanged.                                                                                             | Deferred forward design. Requires per-entry locators, hashes and viewer support; existing `readSyncArtifact` verifies an entire standalone object. Raw source bodies and extraction-linked objects must remain readable.           |
| First-read local/incoming JSONB mirrors                     | SQL reports `first_read_duplicate_local_column_bytes`. Future shared-value representation saving is that sum minus new descriptor/reference overhead; no assumed row count or JSON size. At 1 KiB duplicated per row, 1,000 mirrors represent about **0.98 MiB** before descriptor overhead. | Deferred schema/reader change. Preserve every current review row, its baseline hash, incoming immutable value, decision and reopen behaviour. No nulling or deleting existing values.                                              |
| Fully decided current reviews, or accepted-band first reads | **0 authorised cleanup saving.** For scale only, deleting all 25,961 current decided rows would correspond to about 29.43 MiB at `C`; that deletion is explicitly forbidden. SQL measures the actual subset of fully decided records and accepted-only records.                              | Keep them. They support resolved history and reopening; an accepted band is not a decision. Converged comparisons are already omitted by the writer.                                                                               |
| Superseded decided rows                                     | Only 29 rows before audit/age/run exclusions: roughly **0.033 MiB** at `C`. All are recent, so current 90-day eligibility is zero for these supplied counts.                                                                                                                                 | Already handled by the reviewed age tool. The other 729 superseded rows are undecided and protected.                                                                                                                               |
| Repeated provenance excerpts/locators                       | Measure column sums, semantic duplicate rows and unique source excerpts. Text-sharing envelope: `existing excerpt bytes − unique excerpt bytes − 8 × references − shared-table/index overhead`, floored at zero.                                                                             | Deferred forward normalisation preserving every evidence row and source identity. Unpublished/superseded provenance is a version child and remains protected. No one-off deletion.                                                 |
| Drafts whose content hash equals their publication          | SQL returns matching draft row/content bytes and associated draft-provenance bytes. **0 authorised automatic cleanup saving**; 26.70 MiB is the whole drafts relation, not a proven redundant subset.                                                                                        | Deferred. Hash equality excludes flags and evidence, and does not preserve revision, restore intent or draft provenance. Unchanged first saves already avoid creating a draft.                                                     |

The opportunities overlap. In particular, do not add global duplicate-response
counts to reused-response duplicate counts, or sum per-kind references as unique
objects. `pg_column_size` tuple and JSON column figures are separate estimates;
JSONB compression, TOAST, alignment, index entries and page utilisation make them
non-additive. A projection's full JSON is not identical to the normalised version
rows merely because their content hash matches.

## Stage evidence: what is actually duplicated

The successful pipeline writes eight artefact kinds. The database stores
locators and metadata for source documents and extraction requests/responses,
not a second raw HTML or model-response body. A raw artefact and a source
document pointing to the same path are two references to **one** object. Removing
that artefact row cannot free its source body's Storage object.

| Kind                  | Durable overlap                                                                                                                                                                       | Consequence                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `raw_html`            | `catalogue_source_documents` points at the captured object. Repeated fetches of the same record/hash can reuse the document row while capturing another object under a new sync path. | Preserve every referenced source body. A duplicate fetch is a content-addressing opportunity, not proof that the document already has another body in PostgreSQL.                                     |
| `normalised_markdown` | Deterministically derived from raw HTML with the recorded parser; full-model input embeds it, but compact adapters send only selected eligibility text.                               | It is not universally duplicated in the request. Dropping it requires a reproducible parser/input contract, including historical parser versions.                                                     |
| `model_input`         | Exact user-message string inside `model_request`.                                                                                                                                     | Most direct diagnostic overlap, but pre-request failures need a fallback and the operations viewer expects a separate text artefact today.                                                            |
| `model_request`       | Extraction row references this artefact; it preserves model/settings, prompts and schema.                                                                                             | The extraction metadata is not an equivalent copy. Retain the request.                                                                                                                                |
| `model_response`      | Extraction row points at the response object. A reused extraction currently restores the old response and may produce the identical audit bytes again.                                | Share the object only when bytes are unchanged, retaining both per-sync artefact rows and all extraction links.                                                                                       |
| `validated_json`      | Extraction points at the finalised result; normalised version children hold the projected content.                                                                                    | Finalisation and projection differ. Do not substitute raw model output or a semantic content hash for this evidence.                                                                                  |
| `validation_report`   | Some counts and validity booleans are in `catalogue_extractions`, some flags are stored on versions.                                                                                  | Full schema issues and diagnostic details are not all stored there. Compacting them would need a lossless representation.                                                                             |
| `content_projection`  | The write aggregate is persisted into version children and often a draft.                                                                                                             | It includes the exact projected write/evidence/flags; current version reconstruction is not a byte-for-byte inverse. Treat it as potential representation overlap, not disposable published evidence. |

Keeping only the latest successful sync's artefacts per record is unsafe.
Historical publications can use earlier source documents and copied field-level
provenance. Drafts, source-version ancestry, accepted decisions and reusable
extractions can also depend on earlier syncs. `unchanged` checks may deliberately
reuse a previous source version rather than create a new one. Retaining failures
and disputes alongside the latest success does not cover these dependencies.
The existing tool retains every version-related evidence bundle, and this change
does not narrow that protection.

## Why Storage consumes database space

Of the supplied 106.01 MiB `storage.objects` allocation, **76.46 MiB is indexes
and 29.55 MiB is table/TOAST**. Indexes account for about 72%. The 2.74 KiB
allocation per object is therefore not a 2.74 KiB `metadata` JSON field. UUIDs,
bucket/path identity, timestamps, owners and other Storage-managed columns also
occupy tuples. Paths and derived keys can be represented in multiple indexes.
The exact installed index definitions, column widths, live/dead estimates and
`metadata` sizes are returned by the owner's SQL; their precise composition and
bloat must not be guessed from application migrations.

Fewer objects help the database even when total payload is unchanged. Larger
objects alone do not save space unless they replace multiple object records.
Compressing payload saves Storage bytes, but does not remove the row/index entry
per object. Dropping Storage-managed indexes is not part of this proposal.

The implemented change adds no schema: it registers the new sync's
`model_response` artefact against the old verified locator if restored canonical
bytes equal the stored bytes. It still downloads and verifies the response,
restores and validates it, records the new request/response/validated artefact
links, retains reuse accounting and displays a local response artefact on the
new sync. If restoration adds or changes audit fields, the normal upload path
remains. Failed or disputed syncs retain their diagnostic rows too. Every
reference must disappear before the existing retention tool removes a shared
object, so a canonical path's old owning sync is not sufficient permission.

## Reviews and drafts are not disposable merely because they agree

A first-read row deliberately stores `base_source_value = NULL` and the same
value in `local_value` and `incoming_source_value`. The row also carries the
baseline local-value hash, confidence, review band/reason, decision/resolution,
field path and ordering. Later comparisons can store three different JSONB
values. Large collections and requirement trees can dominate those columns;
measure their sums rather than multiplying by a fixed JSONB header size.

From the schema, the required fixed-width fields total 44 bytes before alignment:
two `bigint`s, one UUID, one integer and the creation timestamp. A row also needs
tuple/null/alignment overhead, its field path, kind, classification, 64-character
hash and any review/resolution metadata. Its variable-value estimate is
`size(base_source_value) + size(local_value) + size(incoming_source_value)`.
For first reads this becomes roughly twice the stored value size plus metadata,
although PostgreSQL compression and TOAST can change the physical allocation.
The SQL reports all three JSONB sums and the text-metadata sum separately from
`pg_column_size(row)`; the measured 1,189-byte allocated average also includes
indexes and page overhead.

`review_band = 'accepted'` means 'stated plainly', not `decision IS NOT NULL`.
Accepted first reads remain approvable, can be marked for review and have their
local values reclassified against changing drafts. Decided current rows form the
resolved review and can be reopened. Deleting all rows for a settled record
would turn its review into `null` and break the existing reopen operation.
`generateSourceReview` already excludes `converged` no-op comparisons.

A future compact representation could derive a first read's incoming value from
its immutable source version, retaining a value descriptor and baseline hash.
It must reproduce the original review unit exactly across projection/parser
versions, preserve stale-edit detection and keep decisions/reopening/audit IDs.
That requires migrations, reader changes and persistence tests, not a small
writer-only omission. The sizing query separately measures records with no
undecided rows and records whose only undecided rows are accepted-band first reads.

Unpublished older versions remain immutable history. Their provenance can be
referenced by drafts, version ancestry and audit events, and even an unreferenced
row is a protected version child. Sharing repeated excerpt text in a new
representation can preserve those identities; deleting it cannot.

A matching draft/publication hash ignores both provenance and flags. An
administrator can change a value and change it back while leaving different
manual provenance and a higher revision. A restored draft also preserves its
restore intent. Discarding/resetting those implicitly would alter the product's
revision and audit semantics. `saveCatalogueDraft` already avoids materialising
an untouched first save, and version persistence already avoids a new source
version for unchanged semantic content. Any further draft compaction needs
full-content/flag/provenance equivalence and an editor concurrency contract.

## Owner measurements and next decisions

The prepared `/tmp/retention-size-estimates.sql` has independent transactions,
each using `BEGIN READ ONLY`, a 30-second statement timeout and `ROLLBACK`.
It returns aggregate row/column bytes, per-kind object copies, index definitions,
first-read mirrors, settled review groups, unpublished/historical provenance,
shared excerpt estimates and publication-hash-equal draft groups. It performs no
payload downloads, deletes, updates, maintenance, external requests or settings
changes beyond transaction-local statement timeouts. Run timed-out blocks
individually; no mutation is needed to obtain the estimates.

These measurements are not a retention plan or approval token. No new one-off
cleanup category is implemented because the plausible large savings intersect
protected recent reviews, referenced objects or immutable evidence. A future
cleanup category still needs the existing dry-run, owner confirmation, fresh
protection checks and safe partial-failure behaviour.

Use the measured duplicate-object counts to prioritise content sharing, then the
first-read mirrored column bytes and repeated provenance text to assess a larger
normalisation change. None of this establishes an immediate 25 MB reduction.
The implemented forward deduplication reduces future growth only; the actual
reuse rate and candidate byte totals still need the owner's read-only results.
