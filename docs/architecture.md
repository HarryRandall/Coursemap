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

Course identity, year-specific records and immutable saved states are separate:

- `academic_years`, `course_directory_entries`, `courses` and `course_years`
- `course_sources` and immutable `course_source_pages`
- `course_snapshots` and their relational fees, attributes, outcomes, assessments,
  offerings, sessions and requisite rules
- `course_rules`, nested `course_rule_groups` and `course_rule_conditions`
- `course_import_runs`, `course_import_targets`, `course_import_stages`,
  `course_import_artifacts`, `course_extractions` and `course_review_items`
- `academic_structures` as permanent programme, major, minor and specialisation
  identities, with year-specific `academic_structure_years`
- `academic_structure_directory_entries`, immutable
  `academic_structure_source_pages` and `academic_structure_snapshots`
- relational structure sections, summary fields, learning outcomes, fees,
  relationships, nested requirement groups and conditions, unmodelled source
  requirements and evidence
- `academic_structure_import_runs`, targets, stages, artefacts, extractions and
  review items
- `catalogue_sources` and immutable `catalogue_source_pages`, the shared
  retrieval provenance that the university calendar already uses and the
  unified import pipeline will adopt
- `university_calendar_events` keyed by academic year, date and title, and
  `university_calendar_imports` recording each command-line import

User-owned planning data is also separate:

- `profiles`
- `plans` and ordered `plan_items`
- `course_attempts`
- approval requests and immutable approval events

The development cutover clears every previous course identity, version,
snapshot, plan, attempt and academic-structure row, then removes the old
`course_versions`, `academic_structure_versions`, `requirement_groups`,
`requirement_conditions`, `academic_structure_relationships` and directory
compatibility schema. No legacy course or academic-structure lineage is
retained. The generic `catalogue_years`, `catalogue_source_documents`,
`catalogue_import_runs` and `catalogue_import_items` tables have been removed;
course and academic-structure imports still use their domain-specific
provenance tables until the [redesign plan](redesign-plan.md) merges them onto
`catalogue_source_pages`.

Course imports run asynchronously through a private Vercel Queue consumer. A
durable run contains no more than ten course targets. Each target records HTML,
normalised Markdown, model input, deterministic extraction, strict OpenRouter
output, validation, relational projection and its change set. Large artefacts
are content-addressed in a private Storage bucket while Postgres stores their
hashes and provenance. Imports never publish. Every changed candidate remains
immutable and requires an administrator to accept or reject it before a
separate publication action.

New queue publishing is feature-gated, but the private consumer always drains
messages already accepted by Vercel. A target receives no more than five
processing attempts. Infrastructure failures while claiming or recording a
terminal result may receive up to twelve bounded queue deliveries, after which
the database's stale-run recovery can fail only expired processing leases or
dispatched targets that have remained queued for more than 30 minutes.

The private `course-import-artifacts` bucket is declared in
`supabase/config.toml`. A production rollout managed outside Supabase's GitHub
integration must run `pnpm db:storage:buckets:linked` against the linked
project after applying migrations and before enabling directory refreshes or
queue publishing. Database migrations alone do not create that hosted bucket.

Academic-structure imports follow the same durable pattern through their own
private queue. The administrator refreshes a year-specific ANU directory,
switches between Programme, Major, Minor and Specialisation tabs, and selects up
to ten records for a run. Each target preserves the source page, Markdown,
extraction input and output, validation, proposed relational rows and review
items. Accepted snapshots remain drafts until an administrator explicitly
publishes them. Planning, onboarding and public requirement views read only the
published snapshot for the selected academic year.

Ambiguous source material remains reviewable instead of being flattened into
plausible but incorrect rules. Deterministic values win model conflicts, model
claims require evidence from the selected academic year's source, and related
course codes create identities only rather than recursive imports.

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

Copy `apps/web/.env.example` to `apps/web/.env.local`. Catalogue import credentials
are only needed when running imports. Select the active extraction model in admin;
`public.import_models` stores enabled model choices and USD token rates. Admins add, refresh and disable models through the dashboard. `app_settings[imports.model]` stores the default. New runs validate the enabled catalogue in the database; accepted runs retain their requested model even after it is disabled. Price badges estimate one target at 10,000 input and 2,000 output tokens, with a short estimate tooltip. Pricing timestamps remain stored with the rates. OpenRouter supplies rates when a model is added or refreshed. Import models can be hidden from selection without removing them from management. Visibility is stored in the catalogue and enforced when choosing a default or queuing new imports. The current default must remain visible. Refreshing pricing preserves visibility.

Local catalogue scripts read the database port from `supabase/config.toml`.
`COURSEMAP_DATABASE_URL` overrides that connection, with `DATABASE_URL` as a
fallback. Both overrides must resolve to loopback; hosted connections are refused.
This is separate from `COURSEMAP_IMPORT_DATABASE_URL`, used by the application import worker.

Room Finder uses built-in map style, terrain and walking-route endpoints. Optional
`NEXT_PUBLIC_ROOM_MAP_STYLE_URL`, `NEXT_PUBLIC_ROOM_MAP_TERRAIN_URL` and
`ROOM_MAP_ROUTING_URL` overrides are available when using another provider.
