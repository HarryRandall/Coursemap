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

Courses, programmes, majors, minors and specialisations share one code, record
and version model. These concepts are deliberately separate:

- `academic_years`
- `catalogue_codes`: a stable typed code shared across years
- `catalogue_records`: that code in one academic year, with the current
  `published_version_id` pointer and optional `archived_at`. There is no draft
  pointer in the core record model.
- `catalogue_versions`: immutable meaningful states of a record. Versions may
  identify the earlier version they are based on and are sealed before use.
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
- `catalogue_sources` and immutable `catalogue_source_pages`: retrieval
  provenance shared by every kind and the university calendar
- `published_course_summaries`: a security-invoker view joining published
  course versions to their code for the directory
- `university_calendar_events` keyed by academic year, date and title, and
  `university_calendar_imports` recording each command-line import

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
retained. The generic `catalogue_years`, `catalogue_source_documents`,
`catalogue_import_runs` and `catalogue_import_items` tables have been removed.

Discovery records each ANU listing attempt in `catalogue_discovery_checks`,
including its completeness and immutable source pages through
`catalogue_discovery_check_source_pages`.
`catalogue_listings` holds the lightweight ANU listing metadata for a real
annual `catalogue_record`; discovery creates the code and record immediately,
before detailed content is synced. An incomplete discovery updates records it
observed but cannot mark unseen listings as no longer current.

Imports run through one pipeline in `apps/web/lib/catalogue-import/` for every
kind. A temporary read-only `catalogue_directory_entries` view keeps the
pre-redesign import procedure working until Branch 04 replaces that pipeline;
`catalogue_import_runs` hold up to ten `catalogue_import_targets`, each
processed through the same ten stages with `catalogue_import_stages`,
`catalogue_import_artifacts` (in the private `course-import-artifacts` bucket)
and `catalogue_extractions` recording every model call and its cost. Kind
adapters under `lib/catalogue-import/kinds/` own fetching, Markdown, the
deterministic parser, the model contract and the projection to shared
`CatalogueContent`; `process-target.ts` owns leases, retries, artefacts and
persistence. A target whose content matches its baseline finishes `unchanged`;
otherwise it assembles an immutable candidate version and finishes `ready` for
review. Runs
dispatch to Vercel Queues when `COURSEMAP_QUEUE_IMPORTS_ENABLED=true` and run
inline after the request otherwise.

Review reads `catalogue_import_changes`: one `change` row per field or section
that differs from the baseline (with old and new values and the source
excerpt) and one `flag` row per parser review item. Administrators accept or
reject each change and acknowledge flags. Applying review creates and seals a
meaningful version. Publishing sets the record's `published_version_id` once
`catalogue_publish_blockers` is empty. Mutable working drafts are not part of
this foundation.

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
