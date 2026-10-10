# Coursemap architecture

## Product boundaries

Coursemap has three product areas:

1. Public catalogue discovery and prerequisite exploration.
2. Authenticated student profiles, attempts and degree plans.
3. Authorised catalogue synchronisation, editing and administration.

Next.js owns routing, server rendering and mutations. Supabase Auth owns identity. Supabase Postgres is the durable source of truth. Vercel builds and serves the application.

## Workspace structure

- `apps/web` owns Next.js routes, application UI, domain modules, assets, scripts and tests.
- `packages/ui` owns retained ReUI primitives, extended components, supporting hooks and compatibility styles. It exports TypeScript source through concrete subpaths and cannot import application code.
- Root tooling owns pnpm, Turbo, Prettier, CI and shared commands. Supabase remains at the root.
- Next.js transpiles `@coursemap/ui`; Tailwind explicitly scans its sources. Product branding remains in `apps/web/app/globals.css`, with keyframes in `animations.css` and third-party corrections in `vendor.css`.
- Turbo caches build, lint, type checking and unit tests. Build inputs include application environment files and relevant environment variables. Development, database operations and Playwright run uncached.

## Application structure

- Route components load data on the server by default.
- Client components are limited to interaction boundaries such as search, drag-and-drop and graph exploration.
- Onboarding is optional. New sign-ups are offered `/onboarding`, which creates the profile and primary plan in one server action; students without a plan otherwise see the dashboard empty state.
- Guests plan without an account. `/auth/guest` starts a plan kept in the `coursemap-guest` cookies (`lib/coursemap/guest-plan.ts`), which the proxy accepts on student routes. The server reads the cookie to render the plan; the browser rewrites it on every change. After sign-in, `transferGuestPlan` moves it into an account without a plan, or asks before replacing an existing one, then clears the cookie after a successful transfer. Failed transfers retain the browser copy. Guest results remain in the browser; Compass and admin still require an account.
- Domain rules remain framework-independent and operate on typed inputs.
- Supabase clients are request-scoped. Server and browser clients live behind separate modules.
- Generated database types are committed and used at every query boundary.

## Vocabulary

The repository uses these terms for these concepts and no synonyms. They are
what the interface says, what the schema is named after and what a commit
message should use.

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

`itemYear`, `snapshot`, `target`, `importRun`, `candidate`, `appliedSnapshot`
and `section review` named these concepts before the redesign and must not
come back.

Administrators and students see: Course, 2027, Draft, Published, Unpublished
changes, Sync from ANU, Changes, Changelog, Student view, and No longer listed
by ANU. They never see catalogue record, catalogue code, sync target, source
version, provenance, revision 14 or materialisation. The developer operations
screens under `/admin/operations` are the one exception, and are permissioned
separately.

## Data model

Courses, programmes, majors, minors and specialisations share one code, record
and version model. These concepts are deliberately separate:

- `academic_years`
- `catalogue_codes`: a stable typed code shared across years
- `catalogue_records`: that code in one academic year, with the current
  `published_version_id` pointer and optional `archived_at`. There is no draft
  pointer in the core record model.
- `catalogue_versions`: immutable meaningful states of a record. Versions may
  identify the earlier version they are based on and are sealed before use.
- `catalogue_drafts`: at most one private mutable `CatalogueContent` aggregate
  per annual record. Its revision is the optimistic-concurrency contract for
  autosave; it is never read by public or student catalogue routes.
- `catalogue_draft_provenance`: current path-specific provenance for a draft.
  A manual edit replaces provenance only for its semantic changed paths.
- `catalogue_change_events` and `catalogue_field_changes`: append-only accepted
  editing, publication, discard and restore operations with exact old and new
  values. `editing_session_id` groups autosaves in the changelog without
  rewriting raw history, and `sync_change_id` names the ANU review row a source
  decision answered
- `catalogue_publications`: historical visibility intervals recording the
  version, publisher, publication time, unpublisher and unpublication time.
- `course_version_details` and `structure_version_details` hold the scalar
  content for their kind. Course child tables (offerings, sessions, outcomes,
  assessments, fees, attributes, unit options, areas of interest, related
  courses and requisite rules) and structure child tables (sections, summary
  fields, outcomes, fees, relationships, requirement groups, conditions,
  options and unmodelled requirements) reference the shared version through
  `version_id`. Child rows can be assembled until the version is sealed.
- `catalogue_version_provenance`: shared field-level source evidence
- `requirement_rules`, nested `requirement_groups`, typed
  `requirement_conditions`, `requirement_condition_options` for set members
  and `requirement_item_references` for graph edges. One rule per kind per
  version: course requisites (`prerequisite`, `corequisite`,
  `incompatibility`, `permission`, `assumed_knowledge`) and structure
  completion requirements (`structure`) share fifteen condition kinds
- `catalogue_sources` and immutable `catalogue_source_pages`: discovery and
  university-calendar retrieval provenance
- `catalogue_source_documents`: immutable detailed ANU material for one annual
  record, addressed by content hash
- `catalogue_syncs`: one independently queued source check for one record, with
  its trigger, model and parser contracts, lease, attempts and terminal result
- `catalogue_sync_changes`: ANU changes waiting for a decision, as a three-way
  comparison of the previous ANU value, the local value and the new ANU value
  over one review unit. Distinct from `catalogue_field_changes`, which audits
  what happened locally. A record has one current review; a later sync
  supersedes the earlier rows rather than deleting their decisions
- `catalogue_sync_stages`, `catalogue_sync_artifacts` and
  `catalogue_extractions`: technical execution evidence and validated reusable
  model responses, read only under `imports.manage` and surfaced only under
  `/admin/operations/catalogue`
- `published_course_summaries`: a security-invoker view joining published
  course versions to their code for the directory. The public reads
  (`published_course_detail`, `published_structure_detail` and this view)
  resolve `published_version_id` and nothing else, and their Next.js cache tags
  are built in `lib/coursemap/published-cache.ts` so publication can drop them
- `university_calendar_events` keyed by academic year, date and title,
  `university_calendar_reviews` holding syncs staged from the admin console
  until they are approved, and `university_calendar_imports` recording each
  publication from the console or the command line

Published reads resolve through `catalogue_records.published_version_id`
where `archived_at` is null. Anonymous readers see published versions and
their children, identities with a published year, and identities referenced
as placeholders by a published rule. Students keep reading the exact version
their recorded attempts point at.

User-owned planning data is also separate:

- `profiles`
- `plans`, ordered `plan_items` and `plan_structures` referencing annual
  `catalogue_records`
- `course_attempts`, each pinned to the exact `catalogue_version_id` that was published
  when the attempt was recorded
- approval requests and immutable approval events

The development cutover clears every previous course identity, version,
snapshot, plan, attempt and academic-structure row, then removes the old
`course_versions`, `academic_structure_versions`, `requirement_groups`,
`requirement_conditions`, `academic_structure_relationships` and directory
compatibility schema. No legacy course or academic-structure lineage is
retained. The generic `catalogue_years`, batch run and per-item tables have
been removed. The current `catalogue_source_documents` table belongs only to
record-level synchronisation.

Discovery records each ANU listing attempt in `catalogue_discovery_checks`,
including its completeness and immutable source pages through
`catalogue_discovery_check_source_pages`.
`catalogue_listings` holds the lightweight ANU listing metadata for a real
annual `catalogue_record`; discovery creates the code and record immediately,
before detailed content is synced. An incomplete discovery updates records it
observed but cannot mark unseen listings as no longer current.

Detailed ANU checks run through `apps/web/lib/catalogue-sync/`. A sync owns one
record and one queue message, and starts only when an administrator syncs that
record; nothing calls the model on its own. The worker claims the sync with a
versioned lease, captures immutable source material and artefacts, converts the
whole page to Markdown and asks the model for the complete record through the
kind adapter. The model owns every field. The adapter keeps each part of the
response that fits the extraction contract, leaves the rest empty with an error
flag, and warns about wording the page does not contain; nothing is rejected
for review to see. The projection is then validated and persisted as an
immutable source version. The worker renews its lease at every stage, and the
source version, draft, review rows and sync result are written in one
transaction fenced on that lease, so a worker that lost it writes nothing.
Queue retries reuse safe completed evidence. Expired work is recovered up to
five attempts; after the last, the run advance or the scheduled sweep
(`app/api/cron/catalogue-syncs`) fails it, and the sweep re-dispatches queued
syncs whose dispatch never completed. Hosted syncs use the `catalogue-sync-v1` Vercel Queue topic; local
development processes the same sync inline after responding.

The record keeps `latest_source_version_id` and `source_checked_at` separately
from its draft and `published_version_id`. An unchanged check advances only the
check time. The first source version populates an empty draft, but never
publishes. Later source changes, or a first sync where local work already
exists, leave local content untouched and finish `review_required`. Branch 04
shows that state on the record; the full source comparison and merge workflow
belongs to Branch 05.

Opening Content creates or resumes the record's mutable draft. A new draft is
initialised from the published version, or from a valid kind-specific empty
aggregate when the record has never been published. Autosave validates the
whole aggregate, checks the expected revision, stores semantic changes and
their audit/provenance rows in one transaction, and rejects stale tabs.
Publishing materialises that JSON aggregate into a sealed normalised version,
moves the publication pointer and clears the draft atomically. Unpublishing
closes the visibility interval without deleting versions. Discarding meaningful
work first materialises an immutable checkpoint; restoring a version copies its
content and provenance into a new draft without changing the original.

## University calendar

Import administrators (`imports.manage`) sync key dates from
`/admin/key-dates/<year>`. A sync fetches the ANU page on the server, parses
it and stages the result with `stage_university_calendar_review`, which
supersedes any pending review for that year. The page compares the staged
dates with the published ones. `approve_university_calendar_review` then
publishes and archives exactly as the command-line import below does, under
the same advisory lock, and records the run. A sync with error diagnostics
can be discarded but not approved. Students see nothing until approval.
Administrators can also add, edit and remove dates by hand with
`save_university_calendar_event` and `remove_university_calendar_event`. Those
dates are marked `origin = 'manual'`, neither an approved sync nor the
command-line import archives them, and each change is kept in
`university_calendar_event_changes` for the year's changelog.

For local work, or where the server cannot reach the ANU site, fetch a
reviewable manifest from the [ANU university calendar](https://www.anu.edu.au/directories/university-calendar), then import it into local Supabase:

```bash
pnpm calendar:fetch --year 2026 --output .catalogue-cache/anu-calendar-2026.json
pnpm calendar:import .catalogue-cache/anu-calendar-2026.json
```

Change the year and filename together. The import script refuses hosted database
connections. Each manifest keeps the source URL, retrieval time, content hash and
parser diagnostics.

A clean import registers the year in `academic_years` if needed, records the
manifest as a `catalogue_source_pages` row, publishes validated events
idempotently using year, date and title, archives previously published events
missing from the manifest and stamps `academic_years.calendar_published_at`. A
manifest with error diagnostics records a failed `university_calendar_imports`
row and leaves published events untouched.
Review diagnostics and removals before importing. Calendar publication differs
from the draft-review workflow for course and academic-structure snapshots.

Calendar publication also reconciles the six standard academic periods: Summer,
First Semester, Autumn, Winter, Second Semester and Spring. Exact semester and
session start/end events supply their dates; examination periods remain separate.
The review previews these dates and reports missing or conflicting boundaries.
Both console approval and the local manifest importer reconcile periods in the
same transaction as calendar publication. Manual key date edits also reconcile
periods.

Every registered academic year has these six period identities. Dates may be
pending, so planning and recording history do not require invented calendar
bounds. The planner also displays all six lanes for future degree years that
have not been registered yet. A course still needs a published catalogue record
in the attempted year. Complete, unambiguous date pairs update existing periods
without changing their IDs; incomplete sources retain established dates.
Calendar bounds reference their published source events. The calendar-period
migration backfills already published key dates across registered years without
fetching ANU again. Staged reviews and archived events do not supply dates.

## Access model

- Published catalogue rows may be readable publicly. Records for unpublished years are not, except the ones a student's own plan or results name.
- Draft catalogue and source-sync operations require database-backed application roles. The default `user` role holds no catalogue permission, so a sign-up reads published content only.
- A user can access only their own profile, plans, items and attempts. Rows that hang off a plan reference `(plan_id, owner_id)`, so they cannot be attached to someone else's plan.
- Reading another student's plan, results or student number takes `students.read`. `admin.access` opens administration and account management but does not imply it.
- Functions in `public` are not executable by `anon` or `authenticated` unless a migration grants them.
- Every exposed table has RLS and explicit Data API grants.
- Privileged functions have a deliberate `search_path`, minimal execution grants and database tests.
- Sealed versions, their child rows, publications, change events and field changes are guarded by triggers: child rows cannot move between versions, a publication can only be closed, the change log is append-only and none of these tables can be truncated. Tests that clean up fixtures disable the named triggers around the cleanup.

## Delivery

Changes move through focused branches and pull requests. GitHub Actions checks formatting, linting, types, tests and the production build. Vercel creates preview deployments and promotes `main` after checks. Supabase schema changes remain forward-only migrations in the same pull request as their application code. Pull requests exercise the complete migration history locally. After every gate passes on `main`, the production database job previews and applies pending migrations through the protected GitHub `Production` environment.

`supabase/migrations/` is an eight-part baseline that states the schema as it
is rather than the ninety-five migrations that reached it. The hosted project
is recreated from it. Add changes after it; see the
[database setup](../supabase/README.md) for what a rebuild has to carry.

## Local configuration

Copy `apps/web/.env.example` to `apps/web/.env.local`. The OpenRouter key is
only needed when adding or refreshing models. Select the active extraction model in admin;
`public.import_models` stores enabled model choices and USD token rates. Admins add, refresh and disable models through the dashboard. `app_settings[imports.model]` stores the default. Price badges estimate one target at 10,000 input and 2,000 output tokens, with a short estimate tooltip. Pricing timestamps remain stored with the rates. OpenRouter supplies rates when a model is added or refreshed. Import models can be hidden from selection without removing them from management. Visibility is stored in the catalogue and enforced when choosing a default. The current default must remain visible. Refreshing pricing preserves visibility.

Local catalogue scripts read the database port from `supabase/config.toml`.
`COURSEMAP_DATABASE_URL` overrides that connection, with `DATABASE_URL` as a
fallback. Both overrides must resolve to loopback; hosted connections are refused.

Room Finder uses built-in map style, terrain and walking-route endpoints. Optional
`NEXT_PUBLIC_ROOM_MAP_STYLE_URL`, `NEXT_PUBLIC_ROOM_MAP_TERRAIN_URL` and
`ROOM_MAP_ROUTING_URL` overrides are available when using another provider.
