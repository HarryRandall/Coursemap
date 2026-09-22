# Catalogue automation

Status: proposal. This is what remains of the catalogue rework. Branches 01 to
08 landed the domain, year-first routes, drafts with audit, one-record ANU
synchronisation, three-way source review, the changelog, the student view and
the sync operations screens. The schema baseline landed with
`refactor/catalogue-schema-baseline`. Scheduling is the last piece.

Move lasting decisions into [architecture](architecture.md) or
[catalogue operations](catalogue-operations.md) as this lands, and delete this
document when it does.

## What already exists and must not be reinvented

| Concern                                | Where it lives                                                          |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Starting one sync for one record       | `public.start_catalogue_sync`                                           |
| Cancelling and recovering stuck syncs  | `public.cancel_catalogue_sync`, `private.recover_stale_catalogue_syncs` |
| Discovery of what ANU lists for a year | `apps/web/lib/catalogue-import/directory.ts`                            |
| The sync pipeline itself               | `apps/web/lib/catalogue-sync/`                                          |
| Classifying what ANU changed           | `apps/web/lib/catalogue/source-review.ts`                               |
| Notifying an administrator             | `private.record_notification`, and the trigger on the sync row          |

A scheduled run calls the same services a manual run calls. There is no
second pipeline and no scheduler-only code path.

## Scope

- Scheduled lightweight discovery, daily to start, reconciling records and
  listings for each kind and year.
- Scheduled detailed syncing through `startCatalogueSync` with
  `trigger = 'scheduled'`.
- Scheduling policy: concurrency caps, model budgets, rate limits, due-at
  metadata, retry control and duplicate suppression. One active sync per
  record is already enforced by a unique index. Stagger work rather than
  syncing every record in the same minute. Keep the cadence configurable in
  `app_settings` rather than spread through the code.

## What a scheduled run may and may not do

A scheduled sync may observe ANU, store the source document, create a source
version, detect changes, create review rows and notify.

It may never overwrite a draft, resolve a conflict that is not objectively
converged, publish, unpublish or discard manual work. The whole point of the
review table is that a person decides, and a schedule is not a person.

Notify on ANU changes available, conflicts, validation blockers, persistent
failures and disappearance. Never on bulk no-change summaries in a personal
inbox.

Source disappearance is already finalised: the record shows "No longer listed
by ANU" with the date last seen and nothing else changes. It stays published
if it was published, keeps its draft, versions and changelog, and the
administrator decides later whether to keep, unpublish or archive it.

## End-to-end journeys

The work is proven through seven journeys: a new ANU course from discovery to
public page; a manually authored record meeting its first sync; an ANU update
reviewed field by field and published; a conflict kept, left alone on the next
identical sync and reopened when ANU moves again; a restore of an older
version that leaves the public page untouched until the restored draft is
published; a disappearance that changes nothing until the administrator acts;
and a failure that leaves draft and publication untouched, reads clearly to
the administrator and retries from diagnostics.

## Gates

`pnpm db:reset`, `pnpm db:test`, `pnpm db:lint`, `pnpm db:types`,
`pnpm test:catalogue-db`, `pnpm check`, `pnpm test`, `pnpm test:e2e`,
`pnpm verify` and a production build.

Security verification is explicit: anonymous reads reach published content
only; drafts, source versions, audit rows and sync diagnostics are unreachable
publicly; ordinary administrator permissions differ from operations
permissions; every new table has row level security; and no RPC escalates
privilege.
