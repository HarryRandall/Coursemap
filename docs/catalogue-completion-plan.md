# Catalogue completion plan

Status: plan. Branches 01 to 04 landed the catalogue domain, year-first routes,
mutable drafts with audit, and one-record ANU synchronisation. This document
carries the five branches that turn that machinery into the finished product,
and the coordination rules for working them in parallel. Move lasting decisions
into [architecture](architecture.md) or [catalogue operations](catalogue-operations.md)
as each branch lands, strike the branch from the sequence, and delete this
document when the last branch lands.

## Foundations already in place

Read these before starting any branch. Every remaining branch builds on them
and none of them should be reinvented.

| Concern                                                              | Where it lives                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Codes, records, versions, publications                               | `supabase/migrations/20260918130000_catalogue_domain.sql`        |
| Discovery and listings                                               | `supabase/migrations/20260921100000_catalogue_discovery.sql`     |
| Drafts, change events, field changes, draft provenance               | `supabase/migrations/20260921200000_catalogue_drafts.sql`        |
| Syncs, source documents, stages, artefacts, extractions              | `supabase/migrations/20260922100000_catalogue_record_sync.sql`   |
| Draft lifecycle (create, save, publish, unpublish, discard, restore) | `apps/web/lib/catalogue/drafts.ts`                               |
| Content shape and validation                                         | `apps/web/lib/catalogue/content.ts`                              |
| Review-unit vocabulary and path application                          | `apps/web/lib/catalogue-import/changes.ts`                       |
| Version to content projection                                        | `apps/web/lib/catalogue-import/version-content.ts`               |
| Sync pipeline and source version persistence                         | `apps/web/lib/catalogue-sync/`                                   |
| Record page shell and tabs                                           | `apps/web/ui/admin/catalogue/record-page.tsx`, `record-tabs.tsx` |

Two existing functions decide most of branch 05 and 06. `diffSnapshotWrites`
already defines the review-unit vocabulary: course and structure scalars one by
one, named collections whole, and each requirement rule separately through
`requirementRuleSlice`. `applyAcceptedChanges` already applies a chosen set of
paths from one content onto another, including whole requirement rule slices.
Neither needs a second implementation.

## Sequence and ownership

| Order | Branch                                   | Base | Owner  | Depends on              |
| ----- | ---------------------------------------- | ---- | ------ | ----------------------- |
| 05    | `feat/catalogue-source-review`           | 04   | Claude | 04                      |
| 06    | `feat/catalogue-changelog`               | 05   | Claude | 05 decision events      |
| 07    | `feat/catalogue-student-view`            | 04   | agent  | none beyond 04          |
| 08    | `feat/catalogue-sync-operations`         | 04   | agent  | none beyond 04          |
| 09    | `feat/catalogue-automation-and-baseline` | 08   | agent  | all of the above merged |

Branches 07 and 08 touch almost nothing that 05 and 06 touch, so they run in
parallel from 04. Branch 09 is the finalisation phase and starts only when
05 to 08 are merged into the stack. Split it into `09A feat/catalogue-automation`
and `09B refactor/catalogue-schema-baseline` if it grows past a reviewable size.

### Working in parallel

- Branch from the base named above, never from `main`. Rebase forward when a
  base branch changes. Use a separate worktree per concurrent branch.
- Reserved migration timestamp prefixes, so two branches never collide on file
  order: 05 uses `20260923*`, 06 uses `20260924*`, 07 uses `20260925*`,
  08 uses `20260926*`, 09 uses `20260927*` and the baseline rewrite.
- `apps/web/types/database.ts` is generated. Never resolve a conflict in it by
  hand. Take either side and run `pnpm db:types` after `pnpm db:reset`.
- Each branch owns its own files. Where two branches must touch
  `record-page.tsx`, the later branch rebases and reapplies rather than
  merging the two versions.
- Every branch leaves `pnpm verify` green, and for database changes also
  `pnpm db:reset`, `pnpm db:test`, `pnpm db:lint`, `pnpm db:types` and
  `pnpm test:catalogue-db`.

## Vocabulary

The finished repository uses these terms and no synonyms. Branch 09 audits the
whole repository against this list, but no new branch may introduce a leftover.

| Concept                           | Term                                           |
| --------------------------------- | ---------------------------------------------- |
| Identity across years             | Catalogue code                                 |
| One code in one year              | Catalogue record                               |
| The one mutable working aggregate | Draft                                          |
| An immutable content snapshot     | Version                                        |
| A version made public             | Publication                                    |
| What ANU lists for a year         | Listing, produced by discovery                 |
| One ANU check for one record      | Sync                                           |
| One ANU change awaiting decision  | Sync change                                    |
| What ANU returned                 | Source document, projected to a source version |
| Where a draft field came from     | Provenance                                     |
| What happened locally             | Change event and field change                  |

Retired words that must not appear for these concepts: `itemYear`, `snapshot`,
`target`, `importRun`, `candidate`, `appliedSnapshot`, `section review`.

Administrators and students see: Course, 2027, Draft, Published, Unpublished
changes, Sync from ANU, Changes, Changelog, Student view, No longer listed by
ANU. They never see: catalogue record, catalogue code, sync target, source
version, provenance, revision 14, materialisation. Developer operations screens
in branch 08 are the one exception.

---

# 05 `feat/catalogue-source-review`

Make the Changes tab genuinely useful by comparing three states rather than two.

## Three-way classification

Every review unit compares the previous ANU value, the current local draft
value and the new ANU value.

| Previous ANU | Local | New ANU | Classification   | Actionable |
| ------------ | ----- | ------- | ---------------- | ---------- |
| A            | A     | A       | none, no row     | no         |
| A            | B     | A       | `local_override` | no         |
| A            | A     | C       | `source_change`  | yes        |
| A            | B     | C       | `conflict`       | yes        |
| A            | C     | C       | `converged`      | no         |

Reducing this to "local differs from incoming" loses the fact that both sides
moved independently, which is the only thing that distinguishes a conflict from
an ordinary change. Classification is a domain function, not a UI guess.

The first sync of a manually authored record has no previous ANU value. Treat
the absent baseline as "no previous ANU": a unit where local and incoming agree
is `converged`, and a unit where they differ is a `conflict`, because the local
value was authored deliberately and ANU has never been seen.

## Durable "Keep current" falls out of the baseline

No separate decision-memory table is needed. `persist_source_version` already
advances `catalogue_records.latest_source_version_id` to every new source
version, and classification reads the previous ANU value from that pointer
rather than from the draft's base version. So after the admin keeps B against
an incoming C, the next sync compares C, B, C and classifies `local_override`,
which is not actionable and raises nothing. When ANU later moves C to D, the
comparison is C, B, D and a fresh conflict appears. This is the behaviour the
product needs and it requires no extra state.

## `catalogue_sync_changes`

A new table, distinct from `catalogue_field_changes`. Field changes audit what
happened locally. Sync changes are ANU observations waiting for a decision.

```sql
create table public.catalogue_sync_changes (
  id bigint generated always as identity primary key,
  sync_id uuid not null references public.catalogue_syncs (id) on delete cascade,
  record_id bigint not null references public.catalogue_records (id) on delete cascade,
  field_path text not null,
  review_unit_kind text not null,        -- scalar | collection | requirement_rule
  classification text not null,          -- source_change | local_override | conflict | converged
  base_source_value jsonb,
  local_value jsonb,
  incoming_source_value jsonb,
  local_value_hash text not null,
  decision text,                         -- use_source | keep_local
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  superseded_at timestamptz,
  position integer not null,
  created_at timestamptz not null default now(),
  constraint catalogue_sync_changes_unit_unique unique (sync_id, field_path)
);
```

`superseded_at` is the addition that gives the record exactly one current
review. When a later sync generates rows, earlier unresolved rows for the same
record are superseded, not deleted, and resolved rows are kept for the
Changelog. Index `(record_id, classification)` where `decision is null and
superseded_at is null`, which is the query the Changes tab and the directory
status both run.

Read access follows the draft policies. No end-user role holds insert, update
or delete on the table: resolution runs through the catalogue draft service
under the same `catalogue.write` gate as every other draft mutation, exactly as
autosave and publication already do.

Converged units are classified but not stored. Nobody has to answer a change
the record already carries, and the comparison can always be recomputed from
the versions.

## Review granularity

Take the units `diffSnapshotWrites` already defines and extract them into a
named enumeration so both the diff and the review read the same list.

- Scalars review individually: title, units, description, study level,
  academic career and every other `course.details.*` and `structure.details.*`
  key.
- Each requirement rule is its own unit at `requirements.<ruleKey>`, so a
  prerequisite change is separate from an incompatibility change.
- Collections review whole: assessment, offerings, learning outcomes, fees and
  the other named collections. No positional array merging. Finer merging waits
  until a collection has stable child identity.

## Path-safe application

The old global stale-baseline check rejected a whole review because an
unrelated field moved. Replace it with a per-path check.

- `local_value_hash` is the hash of the local value at that path when the row
  was generated.
- On read, re-read the live draft value for the path. If its hash still
  matches, display the stored local value. If it does not, the admin edited
  that path after the review was generated: display the live value and
  reclassify `source_change` to `conflict`, because the divergence is now real.
  A `local_override` row stays an override, since a newer local value is still
  a local value.
- An edit to any other path never blocks application.

## Decisions are transactional

There is no global Apply review button. Each row carries two actions.

- **Use ANU** applies exactly that path to the mutable draft through
  `applyAcceptedChanges` restricted to the single path, bumps the draft
  revision, writes a `source_accepted` change event with its field change rows,
  and sets the draft provenance for that path from the incoming source
  version's evidence. No other path's provenance changes. This is the fix for
  the original architecture relabelling unrelated fields as ANU-derived.
- **Keep current** resolves the row, writes a `source_kept` change event and
  leaves the draft and its provenance untouched.

Both record `decision`, `resolved_by` and `resolved_at`. A resolved review
never publishes anything.

## Changes tab

Sections, each hidden when empty:

1. **Conflicts**, showing all three values with the local value labelled as
   manually changed.
2. **Incoming from ANU**, showing current and new.
3. **Kept different from ANU**, collapsed by default, non-actionable, with a
   per-row "Use ANU after all".
4. **Unpublished changes**, the local draft against the published version.

Empty states carry the state they are empty for:

- Everything matches: "No changes to review. This course matches the latest
  ANU information."
- Never synced: "No ANU changes yet. This course hasn't been synced from ANU."
- Local changes only: "No incoming ANU changes. You have 4 unpublished draft
  changes."

Reuse the existing kit. Rows are a decision table, values render through
`CatalogueValue`, status uses `status-pill.tsx` or `badgeVariantForTone`, and
every view carries empty, loading and error states. No hand-rolled table,
select or label.

## Files

| File                                                       | Responsibility                                 |
| ---------------------------------------------------------- | ---------------------------------------------- |
| `supabase/migrations/20260923*_catalogue_sync_changes.sql` | Table, policies, resolve function, event kinds |
| `apps/web/lib/catalogue/review-units.ts`                   | The named review-unit enumeration              |
| `apps/web/lib/catalogue/source-review.ts`                  | Pure three-way classification                  |
| `apps/web/lib/catalogue/source-review-store.ts`            | Generate rows in the sync, resolve a decision  |
| `apps/web/ui/admin/catalogue/changes/`                     | One component per file, per repository rules   |

`lib/catalogue-import/changes.ts` gives up its private unit list to
`review-units.ts` and imports it back. `persist-source-version.ts` calls the
generator inside the same transaction that creates the source version, which is
why generation and reading live apart from resolution: the sync worker runs
outside Next.js and must not import the `server-only` draft service.

The source version behind a review row is resolved through
`catalogue_versions.sync_id` rather than `catalogue_syncs.source_version_id`, so
a decision does not depend on the worker having finished its bookkeeping.

## Tests

The classification truth table is the centre of this branch and gets exhaustive
unit coverage. Beyond it:

- keep current persists, and the same ANU value does not reopen it;
- a later different ANU value does open a fresh conflict;
- Use ANU changes only the accepted path;
- an unrelated manual edit does not block application;
- a same-path manual edit reclassifies to conflict;
- accepted provenance is copied, rejected provenance is untouched;
- no source decision publishes anything;
- source application autosaves and audits correctly;
- first comparison against manually authored content;
- a newer sync supersedes an open review without erasing decisions;
- every Changes empty state;
- directory change and conflict status.

---

# 06 `feat/catalogue-changelog`

Turn `catalogue_change_events`, `catalogue_field_changes`, `catalogue_versions`,
`catalogue_publications`, `catalogue_syncs` and `catalogue_sync_changes` into
one human timeline. An administrator never learns which table produced a row.

## Grouping

Branch 03 records `editing_session_id`. Use it. Five autosaves become one
entry: "Harry edited Description, 5 autosaves over 3 minutes, original to final
value", expandable to every intermediate value. The grouping is presentation
only and the raw audit stays intact.

Event types the timeline understands: manual editing session, first content
creation, source sync, ANU changes accepted, ANU changes kept, conflict
resolution, publication, unpublication, discard, restore, and source
disappearance where useful. Technical events such as stage completion, lease
acquisition and provider responses never appear here; they belong to branch 08.

## Version view, compare and restore

- A version gets a real view, not a database dump: "Version 12, published 14
  September 2026", with Student view, Compare and Restore as draft.
- Compare works between any two of published, draft and a named version, using
  semantic sections and the same diff machinery as the Changes tab, never raw
  JSON.
- Restore as draft is already supported underneath by `restoreCatalogueVersion`.
  Expose it. When a draft would be replaced, warn that the current draft is
  preserved in the Changelog, then restore. The version itself never changes,
  which is why the action is not called revert.
- Discard already creates a restorable checkpoint, so the Changelog shows
  "Draft discarded" with its own Restore as draft.

Tests cover session grouping, retained raw events, actor and origin labels,
publish and unpublish entries, source decisions, compare correctness, restore
including replacing an existing draft, version immutability, keyboard
accessibility, the empty Changelog and large-history pagination.

---

# 07 `feat/catalogue-student-view`

Branch 02 created the route and branch 03 left it published-only. Make the
admin preview exact and finalise the public surface.

- The admin Student view offers Draft and Published when both exist and
  defaults to Draft, because the question being asked is what students will see
  if this is published. With no draft, show Published. With no publication,
  show the draft and say the record has not been published yet. Never render a
  disabled Published tab.
- The admin preview and the public page use the same presentation components.
  Both feed their selected content into shared views such as
  `CourseDetailView` and `StructureDetailView`. Do not create an
  `AdminCoursePreview` beside a `PublicCoursePage`; they drift.
- Finalise the year-first public routes `/courses/2027/comp2700`,
  `/programmes/2027/...`, `/majors/...`, `/minors/...`,
  `/specialisations/...`, and remove `/courses/comp2700?year=2027` and
  `/structures/[code]`. Production compatibility is not being preserved.
- Public loaders resolve only published immutable versions. Never the latest
  version, never the draft, never a source version. The admin Draft view may
  read `catalogue_drafts.content`, and must look identical to what publication
  would produce.
- Courses and structures share the shell and lifecycle but not the layout.
  Give each kind the sections its content actually has.

Tests: draft preview renders the mutable draft, published preview renders the
published version exactly, the public page equals the published preview,
editing a draft does not change the public page, publishing makes the public
page equal the previous draft preview, unpublishing removes it, the
no-publication state, route correctness for every kind, accessibility of the
Draft and Published control, and cache invalidation.

---

# 08 `feat/catalogue-sync-operations`

Keep every diagnostic the old Imports screen had, without making administrators
think in pipeline concepts.

- A global area at `/admin/operations/catalogue` with `syncs` and `discovery`
  sections, and detail routes `/syncs/[syncId]` and `/discovery/[checkId]`.
- The sync list is a technical table: record, year, status, trigger, started,
  duration, model, cost, with search and filtering. Technical statuses live
  here and nowhere else.
- Sync detail restores the useful parts of the old import sheet: source fetch,
  stages, attempts, timings, retries, lease information, failure detail, raw
  source document, HTML, Markdown, deterministic extraction, model input, model
  response, validation, projected content, token usage and cost. The artefact
  viewer and its scroll preview are recovered rather than rewritten; see the
  restore list in [catalogue admin rework](catalogue-admin-rework.md).
- The record page links out through an overflow item, "View sync diagnostics",
  and through "Technical details" on a failure. Diagnostics never becomes a
  fifth record tab.
- Discovery detail exposes year, kind, completeness, discovered and retired
  counts, fetch and source errors, the source document and duration, so
  "No longer listed by ANU" can be explained.
- Notifications move to the record vocabulary: "COMP2700 sync failed", not
  "Import run #123 completed with one failed target". A manual sync that found
  nothing does not notify.
- Operations needs stronger permissions than ordinary catalogue editing. Raw
  prompts, full source responses, costs and worker leases are not for every
  administrator. Use the existing permission infrastructure.

Tests: operations permissions, the list, the detail, stage ordering, artefact
access, extraction metadata, retry detail, discovery detail, the record to sync
links, error technical details, notification wording and deduplication, and no
diagnostic data reachable publicly.

---

# 09 `feat/catalogue-automation-and-baseline`

## Automation

- Scheduled lightweight discovery, daily to start, reconciling records and
  listings for each kind and year. It calls the same discovery service as any
  manual run. No scheduler-only code path.
- Scheduled detailed syncing calls `startCatalogueSync` with
  `trigger = 'scheduled'`. There is no second pipeline.
- Scheduling policy needs concurrency caps, model budgets, rate limits, due-at
  metadata, retry control and duplicate suppression. One active sync per record
  is already enforced by a unique index. Stagger work rather than syncing every
  record in the same minute. Keep the cadence configurable rather than spread
  through the code.
- A scheduled sync may observe ANU, store the source document, create a source
  version, detect changes, create review rows and notify. It may never
  overwrite a draft, resolve a conflict that is not objectively converged,
  publish, unpublish or discard manual work.
- Notify on ANU changes available, conflicts, validation blockers, persistent
  failures and disappearance. Never on bulk no-change summaries in a personal
  inbox.
- Source disappearance is finalised: the record shows "No longer listed by ANU"
  with the date last seen and nothing else changes. It stays published if it
  was published, keeps its draft, versions and Changelog, and the administrator
  decides later whether to keep, unpublish or archive it.

## Baseline and cleanup

Around 91 migrations describe architectures that no longer exist. Production is
being recreated from the repository, so squash aggressively into a baseline
that describes what the application is now, organised by dependency rather than
one file per table:

```text
001_core
002_academic_calendar
003_catalogue
004_catalogue_drafts_audit_sync
005_planning
006_campus
007_notifications
008_security_and_views
```

Delete obsolete schema and application objects: old catalogue item and item-year
tables, snapshot naming, import runs and targets, compatibility views, retired
SQL functions, dead admin routes, `/structures/[code]`, query-year routes, the
old Review, Preview, Edit and History components, importer types, compatibility
adapters, old notifications, dead feature flags and redundant backfills.

Then audit names, interface copy and URLs against the vocabulary tables at the
top of this document, regenerate Supabase types, rebuild fixtures and seeds, and
rewrite `architecture.md`, `catalogue-operations.md` and `conventions.md` rather
than patching them.

## End-to-end journeys

The branch proves the product through seven journeys: a new ANU course from
discovery to public page; a manually authored record meeting its first sync; an
ANU update reviewed field by field and published; a conflict kept, left alone
on the next identical sync and reopened when ANU moves again; a restore of an
older version that leaves the public page untouched until the restored draft is
published; a disappearance that changes nothing until the administrator acts;
and a failure that leaves draft and publication untouched, reads clearly to the
administrator and retries from diagnostics.

## Final gates

`pnpm db:reset`, `pnpm db:test`, `pnpm db:lint`, `pnpm db:types`,
`pnpm test:catalogue-db`, `pnpm check`, `pnpm test`, `pnpm test:e2e`,
`pnpm verify` and a production build, plus authenticated and public catalogue
journeys. A fresh clone against an empty database must migrate, seed, build and
run, because that is what recreating production depends on.

Security verification is explicit: anonymous reads reach published content
only; drafts, source versions, audit rows and sync diagnostics are unreachable
publicly; ordinary administrator permissions differ from operations
permissions; manual authoring, publishing and unpublishing are permission
gated; every new table has row level security; security-definer functions are
reviewed and no RPC escalates privilege.
