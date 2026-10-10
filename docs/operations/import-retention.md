# Import retention

`corepack pnpm catalogue:retention` is a **dry run by default**. The owner must
review the saved plan and approve its token before every real deletion. There
is no scheduler, automatic approval or vacuum operation.

Use Node.js 24 and the existing privileged database helpers. PostgreSQL 17 is
required for the apply transaction timeout, matching `supabase/config.toml`.
Do not use a browser key for Storage. `SUPABASE_SECRET_KEY` is server-only.

## What can be removed

The default cutoff is midnight UTC 90 days before the day of the dry run.
`--days N` changes that age; `--cutoff ISO_DATE` freezes an explicit cutoff.
All age comparisons are strictly older than the cutoff, excluding equality.

| Category           | Eligibility                                                                                                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes`          | Decided, superseded sync changes with creation, resolution and supersession all older than the cutoff; no `catalogue_change_events.sync_change_id` reference; their sync must have completed before the cutoff.                                                                                                            |
| `artifacts`        | Old artefact rows of old terminal syncs, attached to a matching completed/failed old stage, excluding every retained evidence bundle and extraction reference below. Failed or cancelled sync diagnostics can qualify.                                                                                                     |
| `stages`           | Completed/failed old stages of eligible syncs, with no retained artefact. Apply deletes artefact rows explicitly first and refuses a stage with any remaining artefact. It never relies on `ON DELETE CASCADE`.                                                                                                            |
| `artifact_objects` | Old objects in `course-import-artifacts` whose artefact rows are all approved for removal and whose path has no retained source-document/page locator.                                                                                                                                                                     |
| `orphan_objects`   | Old objects in that bucket with no artefact, source-document or source-page row. Only paths shaped as `year/sync-UUID/stage/file` qualify; unknown/legacy paths are reported and retained. If the sync exists, it must independently qualify. A missing sync is acceptable only for an old, recognised, unreferenced path. |

The terminal allowlist is `unchanged`, `review_required`, `applied`, `failed`
and `cancelled`. Missing completion times, recent completion, queued, running,
paused and unknown statuses are excluded. Every sync belonging to an active or
paused run is excluded, even when its own work finished. Run state remains
`active` when the UI computes 'Finished'; that does not authorise retention.

## Retained evidence and rejected candidates

The report contains full candidate identifiers and row fingerprints, rejection
reasons with counts and sample identifiers, and counts for intentionally retained
tables. Rejection precedence gives the first blocking reason per row.

- Every version and child row, publication, change event, field change, draft,
  draft provenance, source document/page and version provenance row stays.
  This is compatible with migration 043's append-only audit protection. No
  deletion or update of those tables is part of retention.
- **All version-related sync evidence bundles stay**, including versions that
  have never been published. A sync is protected if any version names its
  `sync_id`, its `source_version_id` names any version, or its source document
  appears on any version or in any version provenance. Retaining the whole
  bundle preserves intermediate Markdown, model inputs, validation reports
  and projections as well as raw HTML. Copied provenance and source-version
  ancestry therefore need no inference about which individual artefact was
  relevant to a historical publication. This deliberately retains more than
  just currently or historically published versions require.
- A sync with a current review, any undecided review (including superseded
  undecided reviews), or a change linked to a change event keeps its evidence
  bundle. Its eligible, unreferenced decided superseded changes may still be
  removed individually.
- Every extraction row stays, including invalid attempts and reused responses.
  Every extraction's request, response and validated artefact, plus its stage,
  stays. `findReusableExtraction` currently has no age limit and can reuse the
  latest valid completed response with a matching fingerprint. This tool does
  not introduce expiry or remove reuse dependencies. Extraction cleanup and
  accounting retention are deferred until a separately reviewed reuse policy
  exists; merely being old is not enough here.
- Every Storage locator in every source document or source page stays, even
  if it has no artefact row. Removing a redundant technical artefact row does
  not authorise removal of that immutable source body.
- A terminal sync with any unfinished or recently completed stage keeps its
  evidence bundle too, including uploads not yet registered as artefact rows.
- Recent objects, objects with unknown paths, running/recent stages and
  mismatched stage/sync associations are retained. Upload happens before DB
  registration, so an apparent orphan belonging to unfinished work is unsafe.
- Abandoned drafts, unpublished versions and version provenance are not treated
  as disposable. Syncs and run accounting rows also stay.

No migration or pgTAP test is introduced: this tool uses existing relations,
foreign keys and indexes, and direct primary-key batch deletion. It does not
need a new RPC or schema privilege. The coordinator must run the rollback-only
`catalogue-retention.database.test.mjs` through `test:catalogue-db`, including
migration 043 in the combined stack when available. Candidate-query performance
must be measured in the owner's first dry run; no production timings or
reclaimable totals are claimed from the supplied production report.

## Production dry run

Use a private terminal environment with the production connection URL and the
canonical Storage API URL from the **same Supabase project**. Direct connections
use `db.PROJECT.supabase.co`; pooler URLs must use username `postgres.PROJECT`.
Other hostnames and mismatched projects are refused. The database login needs
privileged catalogue reads and `storage.objects` reads, and apply additionally
needs table locks and deletes on the three candidate tables.

Set `COURSEMAP_SYNC_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and, for apply,
`SUPABASE_SECRET_KEY` securely. Do not paste credentials into reports or Git.
The root command loads `apps/web/.env.local` if present; explicit shell settings
take precedence. Empty the local URL overrides so they cannot create an
ambiguous target:

```sh
COURSEMAP_DATABASE_URL= DATABASE_URL= COURSEMAP_RETENTION_ALLOW_HOSTED=1 \
  corepack pnpm catalogue:retention --days 90 \
  --report /tmp/coursemap-production-retention-review.json
```

This uses a repeatable-read, read-only database transaction with a 15-second
statement timeout. It does not call the Storage API during a dry run. Without
`COURSEMAP_RETENTION_ALLOW_HOSTED=1`, even hosted reads are refused. With no hosted
connection configured, the command discovers the local port as other catalogue
scripts do. Clear the hosted URL explicitly when using the local stack.

Read the console summary and the entire saved JSON plan. Check:

1. `target` identifies the expected database login and Storage URL, and `cutoff`
   reflects the approved age. Connection passwords and secret keys are omitted.
2. `summary` contains counts, byte estimates and sample IDs for changes,
   artefacts, stages and objects, with linked/orphan object subtotals.
   `objects` is the total, so do not add its two subtotals to it again.
3. `candidates` lists the exact approved rows/objects. `rejectedSummary` explains
   exclusions; `rejected` lists their identifiers and reasons. `retained` counts
   versions (children are retained too, but not included in that count), audit,
   drafts, extractions and source evidence.
4. `rowBytes` sums `pg_column_size` of candidate rows. These are approximate row
   bytes, not relation/index sizes or a promise of physical disk reclamation;
   TOAST and index overhead are not fully represented. `payloadBytes` is the
   separate Storage payload size from object metadata (`0` if unavailable).
5. The owner approves the precise token and deletion scope. A token is a guard
   against stale plans, not a substitute for the owner's approval.

Reports default to `/tmp/coursemap-retention-TOKEN.json` and are created with
private file permissions. Keep the original dry-run report for the review record;
choose a different report path for apply.

## Apply and recover

Use the **exact printed cutoff** and token from the owner-approved dry run:

```sh
COURSEMAP_DATABASE_URL= DATABASE_URL= COURSEMAP_RETENTION_ALLOW_HOSTED=1 \
  corepack pnpm catalogue:retention --cutoff 'APPROVED_ISO_CUTOFF' \
  --apply --confirm 'APPROVED_SHA256_TOKEN' \
  --report /tmp/coursemap-production-retention-apply-plan.json
```

Apply recomputes the plan from a fresh read-only snapshot. The SHA-256 token binds
policy version, target, cutoff, all candidate row fingerprints and the owning
sync's state. Any change to that plan rejects approval before a delete. Use the
printed cutoff to avoid a new day's rolling cutoff invalidating approval.

Rows are removed first: changes, then artefacts, then empty stages, in batches
of at most 50. Storage objects are removed last through the secret-key Storage
API in batches of at most 20. This leaves no retained DB locator pointing to a
missing payload, including when Storage fails after DB cleanup. It never deletes
`storage.objects` directly in operational code.

Every batch rechecks its exact identities and protection rules under brief
catalogue table locks. Writes to the locked catalogue tables, including review, extraction
registration, version creation and run changes, wait during each batch. Lock waits are limited to
two seconds, statements to five seconds and each apply transaction to 15 seconds.
Storage requests time out after eight seconds. Storage metadata itself remains
unlocked so its API can remove objects. Avoid simultaneous manual Storage
replacement or other administrative deletion tools during apply; normal workers
use immutable content-addressed uploads. Run in a quiet operating window. A lock
or timeout failure stops further batches rather than weakening the checks.

`REPORT.apply.json` records progress before and after every batch, final status,
confirmed deletion counts and any `pendingBatch`. `partial_failure` exits non-zero.
A pending Storage batch may have removed some objects before a timeout or a later
DB acknowledgement failed; its count is not a confirmed total. Abrupt termination
can also leave the summary at `applying` with a pending batch. Consult a fresh
report to determine the remaining rows and objects.

Already removed rows stay removed. Unremoved payloads become old orphans eligible
for a new plan. Rerun a dry run, review the remaining scope and obtain a **new owner
approval** before retrying. Do not reuse the old token after partial progress. An
empty plan can be approved and applied harmlessly. After a complete apply, run
another dry run to confirm no approved candidates remain and inspect exclusions.

## Space reclamation

Deleted PostgreSQL rows free space for future reuse. Database size shown by
Supabase may not fall promptly: dead tuples, TOAST and indexes need autovacuum
maintenance, and physical relation shrinkage can require a separately planned
repack/rewrite. Ordinary vacuum generally makes existing space reusable rather
than shrinking files. Storage payload deletion and Storage metadata reclamation
are separate effects. This tool runs no vacuum, repack, reset or maintenance SQL.
