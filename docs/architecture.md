# Coursemap architecture

## Product boundaries

Coursemap has three product areas:

1. Public catalogue discovery and prerequisite exploration.
2. Authenticated student profiles, attempts and degree plans.
3. Authorised catalogue import, review and administration.

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
- Domain rules remain framework-independent and operate on typed inputs.
- Supabase clients are request-scoped. Server and browser clients live behind separate modules.
- Generated database types are committed and used at every query boundary.

## Data model

Courses, programmes, majors, minors and specialisations share one identity,
year and snapshot model. Identity, year-specific pointers and immutable saved
states are separate:

- `academic_years`
- `catalogue_items`: permanent identity with a `kind` and `code`
- `catalogue_item_years`: one row per item and academic year, carrying the
  `draft_snapshot_id` and `published_snapshot_id` pointers and `archived_at`.
  Composite foreign keys keep the kind consistent across item, year and
  snapshot.
- `catalogue_snapshots`: immutable versions, sealed when they become a pointer.
  `catalogue_publications` records every change of the published pointer.
- `course_snapshot_details` and `structure_snapshot_details` hold the scalar
  content for their kind. Course child tables (offerings, sessions, outcomes,
  assessments, fees, attributes, unit options, areas of interest, related
  courses and requisite rules) and structure child tables (sections, summary
  fields, outcomes, fees, relationships, requirement groups, conditions,
  options and unmodelled requirements) reference the shared snapshot through
  `snapshot_id`. Child rows can be assembled until the snapshot is sealed.
- `snapshot_field_evidence`: shared field-level source evidence
- `requirement_rules`, nested `requirement_groups`, typed
  `requirement_conditions`, `requirement_condition_options` for set members
  and `requirement_item_references` for graph edges. One rule per kind per
  snapshot: course requisites (`prerequisite`, `corequisite`,
  `incompatibility`, `permission`, `assumed_knowledge`) and structure
  completion requirements (`structure`) share fifteen condition kinds
- `catalogue_sources` and immutable `catalogue_source_pages`: retrieval
  provenance shared by every kind and the university calendar
- `published_course_summaries`: a security-invoker view joining published
  course snapshots to their identity for the directory
- `university_calendar_events` keyed by academic year, date and title, and
  `university_calendar_imports` recording each command-line import

Published reads resolve through `catalogue_item_years.published_snapshot_id`
where `archived_at` is null. Anonymous readers see published snapshots and
their children, identities with a published year, and identities referenced
as placeholders by a published rule. Students keep reading the exact snapshot
their recorded attempts point at.

User-owned planning data is also separate:

- `profiles`
- `plans`, ordered `plan_items` referencing a course item and year, and
  `plan_structures` referencing a structure item year
- `course_attempts`, each pinned to the course snapshot that was published
  when the attempt was recorded
- approval requests and immutable approval events

The development cutover clears every previous course identity, version,
snapshot, plan, attempt and academic-structure row, then removes the old
`course_versions`, `academic_structure_versions`, `requirement_groups`,
`requirement_conditions`, `academic_structure_relationships` and directory
compatibility schema. No legacy course or academic-structure lineage is
retained. The generic `catalogue_years`, `catalogue_source_documents`,
`catalogue_import_runs` and `catalogue_import_items` tables have been removed.

Imports run through one pipeline in `apps/web/lib/catalogue-import/` for every
kind. `catalogue_directory_entries` mirrors the ANU listing per kind and year;
`catalogue_import_runs` hold up to ten `catalogue_import_targets`, each
processed through the same ten stages with `catalogue_import_stages`,
`catalogue_import_artifacts` (in the private `course-import-artifacts` bucket)
and `catalogue_extractions` recording every model call and its cost. Kind
adapters under `lib/catalogue-import/kinds/` own fetching, Markdown, the
deterministic parser, the model contract and the projection to the shared
snapshot write shape; `process-target.ts` owns leases, retries, artefacts and
persistence. A target whose content matches its baseline finishes `unchanged`;
otherwise it assembles a candidate snapshot and finishes `ready` for review.
The first snapshot for an item year becomes its draft immediately. Runs
dispatch to Vercel Queues when `COURSEMAP_QUEUE_IMPORTS_ENABLED=true` and run
inline after the request otherwise.

Review reads `catalogue_import_changes`: one `change` row per field or section
that differs from the baseline (with old and new values and the source
excerpt) and one `flag` row per parser review item. Administrators accept or
reject each change and acknowledge flags; **Apply** writes a new draft from
the baseline plus the accepted changes (or points the draft at the candidate
when everything is accepted). **Publish** moves `published_snapshot_id` to the
draft and clears the draft pointer once `catalogue_publish_blockers` is empty:
no open changes and no open blocking flag on the draft's target.

## University calendar

Fetch a reviewable manifest from the [ANU university calendar](https://www.anu.edu.au/directories/university-calendar), then import it into local Supabase:

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

Academic periods inferred from class dates still need verification against the
official calendar; importing calendar events does not itself reconcile them.

## Access model

- Published catalogue rows may be readable publicly.
- Draft catalogue and import operations require database-backed application roles.
- A user can access only their own profile, plans, items and attempts.
- Every exposed table has RLS and explicit Data API grants.
- Privileged functions have a deliberate `search_path`, minimal execution grants and database tests.

## Delivery

Changes move through focused branches and pull requests. GitHub Actions checks formatting, linting, types, tests and the production build. Vercel creates preview deployments and promotes `main` after checks. Supabase schema changes remain forward-only migrations in the same pull request as their application code.

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
