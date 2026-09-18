# Coursemap redesign plan

Status: plan. This document sets the order of work for the catalogue schema and
import redesign, the prerequisite modelling and display work, the student
interface wiring and the campus map refresh. Each project lists its target
state, the stacked pull requests that reach it and the checks that prove it.
When a pull request lands, move its lasting decisions into
[architecture](architecture.md) or the relevant guide and strike it from the
sequence here. Delete this document when the last project lands.

## Decisions

These were agreed before the plan was written and are not reopened below.

| Topic               | Decision                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing data       | Development cutover. No hosted rows need to survive. The 72 migrations are squashed into a fresh baseline once the redesign settles.            |
| Entity model        | One import, review and publication pipeline for every catalogue kind. Kind-specific content lives in separate child tables.                     |
| Requirements        | One requirement tree model and one condition vocabulary shared by course requisites and programme, major, minor and specialisation structures.  |
| Approval            | Pull-request style. An import produces changes against the working version; an administrator resolves them and publishes. No section approvals. |
| Execution           | Keep the Vercel Queue consumer, OpenRouter extraction and deterministic parsing. The redesign targets the data model and the workflow.          |
| University calendar | Calendar events hang off `academic_years`. The legacy `catalogue_*` provenance tables are removed.                                              |
| Structure kinds     | Programmes, majors, minors and specialisations are all in scope. Programmes land first and are the reference implementation.                    |
| Requisite display   | Every condition kind renders structurally on the student side. Prose is a fallback for `other` only.                                            |
| Compass             | A real assistant over the student's plan and the published catalogue, with chats persisted in the database.                                     |
| Notifications       | An in-app inbox backed by a database table, fed by application events.                                                                          |
| Order               | Schema and import flow together, then prerequisites, then student interface, then campus map.                                                   |
| Delivery            | Stacked pull requests, prepared locally and pushed in order. Every pull request leaves `pnpm verify` and the database gate green.               |

## Current state

Measured on `main` at `63b11d1`.

- 72 migrations, about 27,900 lines of SQL, 77 public tables, 6 private tables,
  8 views and 35 public functions. `apps/web/types/database.ts` is 5,620 lines.
- Three reset or cutover migrations (`20260829110000`, `20260829135000`,
  `20260830120000`) and one remove-then-restore pair for the calendar.
- Courses and academic structures each have an identity table, a per-year
  table carrying draft and published snapshot pointers, an immutable snapshot
  table with ten or more child tables, and a full import stack of sources,
  pages, directory entries, runs, targets, stages, artefacts, extractions and
  review items. The two stacks drift: `origin` is `import | manual_edit |
legacy_backfill` on one side and `imported | manual` on the other, lifecycle
  sits on `course_years` but confirmation sits on
  `academic_structure_snapshots`, and import targets end at `ready_for_review`
  for courses but `succeeded` for structures.
- Import targets carry a third set of snapshot pointers (`baseline_draft`,
  `baseline_published`, `candidate`).
- Two rule vocabularies. `course_rule_conditions` has 12 kinds with
  `units_total` and members in a join table. `academic_structure_requirement_conditions`
  has 8 kinds with `unit_total`, members in an options table and `minimum_count`
  instead of `at_least`.
- The legacy `catalogue_years`, `catalogue_sources`, `catalogue_source_documents`,
  `catalogue_import_runs` and `catalogue_import_items` tables exist only for the
  calendar command-line importer, while the `catalogue_` prefix was reused for
  `catalogue_section_reviews` and seven review functions.
- Approval is three overlapping concepts: review items (per-field diagnostics
  with resolution columns nothing writes), section approvals with content
  fingerprints and bulk eligibility, and a change-set artefact. Accept
  (candidate to draft) is separate from publish (draft to published). First
  imports become drafts automatically; later imports need Accept or Apply. A
  critical-uncertainty banner and a Confirm review action survive alongside.
- `apps/web/lib/course-import/` and `apps/web/lib/structure-import/` are
  near-copies totalling roughly 16,000 lines. Nine module pairs mirror each
  other (`contract.ts` 1,618 and 1,134 lines, `process-target.ts` 731 and 1,107,
  `persist-snapshot.ts` 1,128 and 906, `import-store.ts` 893 and 1,043).
- Structure imports share one active run across all four kinds, so a stuck
  programme run blocks minors.
- The admin requisite editor supports the full tree, but the public
  `RequisiteExpression` supports five condition kinds and two operators. Any
  rule with GPA, WAM, permission, incompatibility, marks, `course_set_units` or
  `at_least` falls back to prose. The planner reports `unknown` for admission,
  standing, GPA, WAM and incompatibility. The graph draws course-code edges
  with no AND or OR semantics. Progress ignores planned and enrolled courses.
- Compass is a `localStorage` chat with keyword stub replies and a sample usage
  page, and it reads the admin import-model catalogue. Notifications are a
  hardcoded sample array. There is no shared empty-state component. The Room
  Finder is a 1,253-line client component holding layers, filters, directions,
  floors and journey steps in one panel.

## Project A: catalogue schema and import redesign

### Target data model

Tables are listed by area. Every exposed table gets RLS, explicit grants and a
database test. Names are proposals; keep them once the first migration lands.

Identity and years

- `academic_years`: unchanged role, gains `calendar_published_at`.
- `catalogue_items`: `id`, `public_id`, `kind`
  (`course | programme | major | minor | specialisation`), `code`. Replaces
  `courses` and `academic_structures`. A unique index on `(kind, code)`.
- `catalogue_item_years`: `item_id`, `academic_year_id`, `draft_snapshot_id`,
  `published_snapshot_id`, `archived_at`. Replaces `course_years` and
  `academic_structure_years` and the `lifecycle_status` and
  `confirmation_status` columns.
- `catalogue_snapshots`: `id`, `public_id`, `item_year_id`, `kind`,
  `origin` (`import | manual`), `based_on_snapshot_id`, `import_target_id`,
  `source_page_id`, `sealed_at`, `content_hash`, `created_by`. Immutable after
  sealing, enforced by trigger as today.
- `catalogue_publications`: `item_year_id`, `snapshot_id`, `published_by`,
  `published_at`. A ledger; the pointer on `catalogue_item_years` is the
  current value.

Kind-specific content (one row set per snapshot)

- Course: `course_snapshot_details` (title, units, college, description,
  delivery, level and the scalar fields now on `course_snapshots`),
  `course_offerings`, `offering_sessions`, `course_learning_outcomes`,
  `course_assessment_items`, `course_assessment_outcomes`, `course_fees`,
  `course_attributes`, `course_unit_options`, `course_areas_of_interest`,
  `course_related_items`.
- Structure: `structure_snapshot_details` (title, units, award, college,
  duration and the scalar summary fields), `structure_sections`,
  `structure_learning_outcomes`, `structure_fees`, `structure_relationships`.
  `academic_structure_summary_fields` and
  `academic_structure_unmodelled_requirements` are removed; summary fields
  become typed columns or `other` conditions and unmodelled text becomes an
  import flag.
- Shared: `snapshot_field_evidence` (`snapshot_id`, `field_path`,
  `source_page_id`, `locator`, `excerpt`, `confidence`, `method`).

Requirements (shared by every kind)

- `requirement_rules`: `snapshot_id`, `rule_kind`
  (`prerequisite | corequisite | incompatibility | permission | assumed_knowledge | structure`),
  `hardness` (`hard | advisory`), `source_text`, `review_state`, `position`.
  Structures use `structure` for their completion requirements. A programme
  can also carry `prerequisite` for admission.
- `requirement_groups`: `rule_id`, `parent_group_id`, `operator`
  (`all_of | any_of | at_least`), `minimum_count`, `minimum_units`,
  `maximum_units`, `label`, `position`. `label` carries structure headings
  such as "Major" or "Electives".
- `requirement_conditions`: `group_id`, `condition_kind`, `position` and typed
  columns: `item_id`, `requirement_mode` (`completed | completed_or_concurrent`),
  `minimum_mark`, `minimum_units`, `subject_code`, `minimum_level`,
  `maximum_level`, `minimum_year`, `minimum_gpa`, `minimum_wam`, `tag`,
  `free_text`. Check constraints require the columns each kind needs.
- `requirement_condition_options`: `condition_id`, `item_id`, `code`,
  `position`. Members for set-based kinds.
- `requirement_item_references`: `rule_id`, `item_id`. Flattened references
  for the graph and for "unlocks" queries, maintained by the projection step.

Condition vocabulary. This is the union of the two current models, mapped as
follows.

| Kind               | Meaning                                                 | Replaces                                                       |
| ------------------ | ------------------------------------------------------- | -------------------------------------------------------------- |
| `course`           | Complete one course, optional mark, optional concurrent | course `course`                                                |
| `incompatible`     | Must not have completed one course                      | course `incompatible`, structure `incompatible` relationship   |
| `structure`        | Complete a programme, major, minor or specialisation    | course `admission`, structure `structure_list` with one option |
| `structure_set`    | Complete N structures from a list                       | structure `structure_list`                                     |
| `course_set_units` | N units from a listed set of courses                    | course `course_set_units`, structure `course_list`             |
| `units_total`      | N units of any study                                    | course `units_total`, structure `unit_total`                   |
| `subject_units`    | N units in a subject code                               | course `subject_units`, structure `subject`                    |
| `level_units`      | N units at a level range, optional subject              | course `level_units`, structure `level`                        |
| `tagged_units`     | N units carrying a catalogue tag such as a college      | structure `tag`                                                |
| `elective_units`   | N units of unrestricted electives                       | structure `unrestricted`                                       |
| `year_standing`    | Minimum year of standing                                | course `year_standing`                                         |
| `gpa`              | Minimum GPA                                             | course `gpa`                                                   |
| `wam`              | Minimum WAM                                             | course `wam`                                                   |
| `permission`       | Permission of convenor or college, free text            | course `permission`                                            |
| `other`            | Unmodelled free text                                    | course `other`, structure `free_text`                          |

Import (shared)

- `catalogue_sources`: `kind`, `base_url`, `is_active`.
- `catalogue_source_pages`: `source_id`, `academic_year_id`, `kind`, `url`,
  `content_hash`, `storage_path`, `fetched_at`. Immutable. Also records the
  university calendar manifest.
- `catalogue_directory_entries`: `academic_year_id`, `kind`, `code`, `title`,
  `item_id`, `source_page_id`, `first_seen_at`, `last_seen_at`.
- `catalogue_directory_statuses`: `academic_year_id`, `kind`, `status`,
  `refreshed_at`, `message`.
- `catalogue_import_runs`: `run_number`, `academic_year_id`, `kind`,
  `model_id`, `status` (`queued | running | completed | failed | cancelled`),
  `requested_by`, counts and token totals. A run has one kind. Concurrency is
  limited per target rather than one global active run.
- `catalogue_import_targets`: `run_id`, `directory_entry_id`, `item_year_id`,
  `baseline_snapshot_id` (the draft at start, or the published snapshot when
  there is no draft), `candidate_snapshot_id`, `status`
  (`queued | running | ready | unchanged | failed | cancelled`),
  `attempt_count`, `lease_expires_at`, `queue_message_id`, `dispatched_at`,
  `error_code`, `error_message`. Two snapshot pointers, not three.
- `catalogue_import_stages`, `catalogue_import_artifacts`,
  `catalogue_extractions`: as today, keyed on the shared target.
- `catalogue_import_changes`: `target_id`, `entry_kind` (`change | flag`),
  `field_path`, `old_value`, `new_value`, `severity`, `is_blocking`,
  `issue_code`, `summary`, `source_locator`, `source_excerpt`, `status`
  (`open | accepted | rejected | acknowledged`), `resolved_by`, `resolved_at`,
  `resolution_note`. A change must have both values; a flag has neither. This
  table replaces `course_review_items`, `academic_structure_review_items`,
  `catalogue_section_reviews`, `course_snapshot_confirmations`,
  `course_snapshot_confirmation_items` and the `change_set` artefact.

Retained without structural change

- `plans`, `plan_items`, `plan_structures`, `course_attempts`, `profiles`,
  `approval_requests`, `approval_events`. Foreign keys move from `courses.id`
  and `academic_structure_years.id` to `catalogue_items.id` and
  `catalogue_item_years.id`, with a trigger asserting the referenced kind.
- `private.app_roles`, `app_permissions`, `role_permissions`, `user_roles` and
  the `admin_*` views.
- `import_models`, `app_settings`.
- `campus_map_*` and `campus_indoor_maps`.
- `university_calendar_events`, re-keyed to `academic_years` and
  `catalogue_source_pages`.

Removed

- `courses`, `course_years`, `course_snapshots` scalar columns (moved to
  details), `academic_structures`, `academic_structure_years`,
  `academic_structure_snapshots`, `academic_structure_summary_fields`,
  `academic_structure_unmodelled_requirements`, `course_snapshot_confirmations`
  and items, `private.course_snapshot_confirmation_contexts`,
  `private.academic_structure_snapshot_assemblies`.
- Both `*_rules`, `*_rule_groups`, `*_rule_conditions`,
  `*_rule_condition_courses`, `*_requirement_groups`, `*_requirement_conditions`,
  `*_requirement_options` and `course_rule_course_references`.
- Both import stacks (`course_import_*`, `course_sources`, `course_source_pages`,
  `course_directory_entries`, `course_extractions`, `course_review_items`,
  `academic_structure_import_*`, `academic_structure_sources`,
  `academic_structure_source_pages`, `academic_structure_directory_entries`,
  `academic_structure_directory_statuses`, `academic_structure_extractions`,
  `academic_structure_review_items`).
- Legacy `catalogue_years`, `catalogue_source_documents`, `catalogue_import_items`,
  `catalogue_section_reviews` and the section review functions.

### Target lifecycle

1. Directory refresh for a year and kind writes `catalogue_directory_entries`
   and creates `catalogue_items` and `catalogue_item_years` for new codes.
2. The administrator selects up to ten entries and starts a run. The database
   creates the run and targets, records `baseline_snapshot_id` per target and
   the application enqueues one message per target.
3. The consumer processes a target through the same stage names as today.
   `database_project` uses the kind adapter; `snapshot_persist` writes the
   candidate snapshot, computes `catalogue_import_changes` against the
   baseline projection and marks the target `ready` or `unchanged`.
4. When a target has no baseline, the candidate becomes the draft immediately
   and every field is recorded as an added change already accepted. Flags stay
   open.
5. Otherwise the administrator opens the review. Each change shows old and new
   with the source excerpt and offers Accept or Reject; each flag offers
   Acknowledge with an optional note. **Apply** creates a new draft snapshot
   from the baseline plus accepted changes in one transaction and refuses a
   stale baseline. Rejected changes leave the draft untouched.
6. Manual editing creates a new draft snapshot based on the current draft.
   Edits to a field close any open change on that field for the same target.
7. **Publish** sets `published_snapshot_id` to the draft when the draft differs
   from the published snapshot and no blocking flag is open on the draft or on
   the target that produced it. The disabled state states the reason.
8. History lists runs, targets, changes, snapshots and publications for the
   item year. Restore creates a new draft based on a historical snapshot.

Status vocabulary is deliberately small: runs and targets have the statuses
above, changes have four, and an item year has draft, published and archived
pointers only. There is no `review_status`, `confirmation_status`,
`lifecycle_status`, `has_critical_uncertainty` or section approval.

### Target application layout

- `apps/web/lib/catalogue-import/` becomes the single pipeline:
  `source.ts`, `markdown.ts`, `openrouter.ts`, `artifact-store.ts`,
  `queue.ts`, `import-store.ts`, `process-target.ts`, `persist-snapshot.ts`,
  `changes.ts` (baseline diff and flag rules) and `kinds/{course,structure}/`
  holding `deterministic.ts`, `prompt.ts`, `contract.ts` and `project.ts`
  behind one `CatalogueKindAdapter` interface. `lib/course-import/` and
  `lib/structure-import/` are deleted.
- `apps/web/lib/coursemap/` keeps its name. The paired `admin-course-*` and
  `admin-academic-structure-*` modules collapse into `admin-catalogue-*`
  modules parameterised by kind; `catalogue-section-review*.ts`,
  `catalogue-proposal-*.ts`, `pending-catalogue-import.ts`,
  `course-snapshot-actions.ts` and `academic-structure-snapshot-actions.ts`
  are replaced by `catalogue-review-actions.ts` and
  `catalogue-snapshot-actions.ts`.
- One queue consumer at `app/api/queues/catalogue-import/route.ts` and one
  admin API at `app/api/admin/catalogue-imports/`. Directory refresh keeps
  server-sent events.
- Admin routes keep their addresses (`/admin/courses`, `/admin/programmes`,
  `/admin/majors`, `/admin/minors`, `/admin/specialisations`, each with
  `[uuid]`, `/history`, `/preview`, `/versions/[uuid]` and `/imports`) but
  render shared components from `apps/web/ui/admin/catalogue/` with a kind
  parameter. Kind-specific section renderers live under
  `ui/admin/catalogue/sections/{course,structure}/`.
- Requirement editing moves from `ui/admin/requisites/` to
  `ui/admin/requirements/` and serves both course requisites and structure
  requirements.
- Planning, onboarding and public reads use `published_catalogue_item`,
  `published_requirement_graph` and `published_course_availability` functions
  that resolve through `catalogue_item_years.published_snapshot_id`.

### Stacked pull requests

Each pull request contains its migration, regenerated types, application
changes, database tests and updated guides. The working tree is truncated by
each migration, so intermediate steps carry no data migration logic. The final
step squashes the migration history.

| Order | Branch                                           | Scope                                                                                                                                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | `refactor/catalogue-redesign-01-plan`            | This document. Remove `catalogue-review-design.md` (absorbed here). Index update.                                                                                                                                                                                                                                                               |
| A2    | `refactor/catalogue-redesign-02-calendar`        | Re-key `university_calendar_events` to `academic_years`. Update `calendar-importer.mjs` to write `catalogue_source_pages`. Drop the five legacy `catalogue_*` tables. Frees the `catalogue_` names for later steps.                                                                                                                             |
| A3    | `refactor/catalogue-redesign-03-items`           | `catalogue_items`, `catalogue_item_years`, `catalogue_snapshots`, `catalogue_publications`, kind detail tables, `snapshot_field_evidence`. Re-point plans, attempts and the two existing import stacks. Rewrite published read functions. Update `published-courses.ts`, planner catalogue loading, onboarding and admin workspace projections. |
| A4    | `refactor/catalogue-redesign-04-requirements`    | The shared `requirement_*` tables and the condition vocabulary. Update `requisite-conditions.ts`, both projection modules, the admin editor, `published_requirement_graph`, structure requirement display and `planner.ts`. Drop both old rule sets.                                                                                            |
| A5    | `refactor/catalogue-redesign-05-import-pipeline` | Shared import tables and the single `lib/catalogue-import/` pipeline with kind adapters, one consumer, one admin API, run and target lifecycle functions with per-target recovery. Delete `lib/course-import/` and `lib/structure-import/`. `test:catalogue-db` rewritten.                                                                      |
| A6    | `refactor/catalogue-redesign-06-review`          | `catalogue_import_changes`, baseline diff in `changes.ts`, `apply_catalogue_import_changes` and `publish_catalogue_snapshot` rewritten on the new gate. Review workspace shows changes and flags per target. Remove section approvals, confirmations, the critical-uncertainty banner and Confirm review.                                       |
| A7    | `refactor/catalogue-redesign-07-admin-workspace` | Shared directory, workspace, history and preview components for every kind. Programme import walkthrough end to end with Playwright. Majors, minors and specialisations verified against the same components.                                                                                                                                   |
| A8    | `refactor/catalogue-redesign-08-baseline`        | Squash all migrations into `supabase/migrations/<timestamp>_baseline.sql` plus a seed. `pnpm db:types` must produce no diff against A7. Update `architecture.md`, `supabase/README.md`, `catalogue-workspace-refresh.md` and `import-run-recovery.md`.                                                                                          |

A3 and A5 are the largest steps. If either exceeds a reviewable size, split
along the course and structure kind boundary rather than across layers, so
each half still passes verification.

### Verification

Per pull request: `pnpm verify`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:lint`,
`pnpm db:types` with a clean diff, and `pnpm test:catalogue-db` from A5 on.
Playwright covers the administrator journey from directory refresh through
review to publication for one course and one programme from A7 on. Database
tests assert that anonymous users read only published snapshots, that a
sealed snapshot cannot change, that Apply refuses a stale baseline and that
Publish refuses while a blocking flag is open.

### Open items to settle during A5 and A6

- Whether an import run may mix kinds. The plan says one kind per run; revisit
  if administrators want to queue a programme with its majors together.
- Whether Acknowledge on a blocking flag requires a note.
- Whether a rejected change is remembered for the next run of the same target.
  The plan says no; the next run recomputes against the new baseline.

## Project B: prerequisite modelling and display

Depends on A4 for the shared requirement model and on A6 for the review gate.

### Target

- One `RequirementExpression` type in `lib/coursemap/requirement-types.ts`
  derived directly from `requirement_*` rows. It replaces both the narrow
  `RequisiteExpression` and `CourseRuleExpression`. Published read functions
  return the full tree. The text parser in `requisite-summary.ts` remains only
  as the administrator's automatic mapping aid.
- One evaluator in `lib/coursemap/requirement-evaluation.ts` used by the
  course page, the planner, plan risks and the requirements page. Inputs are
  completed attempts with marks, planned items with their period order,
  enrolled structures from the plan, GPA and WAM from academic history and
  year standing derived from completed units. Outcomes per node are `met`,
  `planned`, `not_met` or `unknown`, and `unknown` is limited to `permission`
  and `other`.
- The student-facing requisite card renders every kind structurally:
  - A group renders as a stack with a heading that states the rule in plain
    words: "Complete all of", "Complete any one of", "Complete at least 2 of",
    "Complete 24 units from". Nested groups indent one level with a connector.
  - Course conditions render as a stacked list of course chips with code,
    title, units and status colour, so "four courses" reads as four cards.
  - Unit conditions render as a progress bar with the count achieved and
    required and the scope ("in COMP", "at 2000 level or above").
  - `gpa`, `wam` and `year_standing` render as badges showing the student's
    value against the threshold when signed in.
  - `incompatible` renders as a separate red section, not inside the stack.
  - `structure` and `structure_set` render as programme chips linking to the
    published structure.
  - `permission` and `other` render as notes with the source text.
- The prerequisite graph draws group nodes for `any_of` and `at_least` so
  alternatives are visible, keeps course-code edges for `all_of`, and marks
  planned courses distinctly from completed ones.
- The administrator editor is reused for structure requirements. Automatic
  mapping is extended to the deterministic parser output. The editor no longer
  locks when a condition kind is unsupported because the vocabulary is shared.

### Stacked pull requests

| Order | Branch                                 | Scope                                                                                                              |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| B1    | `refactor/requirements-01-expression`  | Single expression type and published read shape. Remove the narrow expression and the published text fallback.     |
| B2    | `feat/requirements-02-evaluation`      | Shared evaluator with planned, GPA, WAM, standing and incompatibility handling. Planner and plan risks consume it. |
| B3    | `feat/requirements-03-student-display` | Stacked requisite card, progress bars, badges, incompatibility section. Component tests for each kind.             |
| B4    | `feat/requirements-04-graph`           | Group-aware graph with planned state.                                                                              |
| B5    | `feat/requirements-05-admin-editor`    | Editor reuse for structures, extended automatic mapping, removal of the unsupported-kind lock.                     |

### Verification

Unit tests for the evaluator across every kind and operator, including
concurrent enrolment and marks. Component tests for each rendered kind and for
nested stacks. Playwright for one course with an `at_least` rule and one with a
`course_set_units` rule as a signed-in student with partial progress.

## Project C: student interface wiring

Depends on A3 for published reads and on B2 for the evaluator used by Compass
tools and plan-risk notifications.

### Target

- Shared states in `ui/common/`: `EmptyState` and `LoadingState` with a small
  set of variants, adopted by dashboard, plan, requirements, courses, calendar,
  Compass and rooms. Feature-specific empties keep their copy and illustration
  but use the shared frame.
- Notifications: a `notifications` table (`user_id`, `kind`, `title`, `body`,
  `href`, `read_at`, `created_at`, `dedupe_key`) with own-row RLS and a
  `mark_notifications_read` function. Producers: import run completion for
  administrators, key dates within seven days, new plan risks, published
  changes to a course in the student's plan. The bell reads real rows and the
  sample array is deleted.
- Compass: `assistant_chats`, `assistant_messages` and `assistant_usage`
  tables with own-row RLS. A streaming route at `app/api/assistant/chat` calls
  OpenRouter with the model from `app_settings[assistant.model]`, separate
  from the import model, with tools for course search, plan reading,
  requirement evaluation and requirement progress. Usage records tokens and
  cost per message and the usage page reads them. The `localStorage` draft
  store becomes an optimistic cache only. The "Coming soon" tools menu is
  removed.
- Landing: copy and screenshots reflect the shipped product, popular searches
  come from the published catalogue, and the primary call to action leads to
  onboarding.
- Onboarding and dashboard: the wizard reads structures through the shared
  published functions, the dashboard shows real requirement progress from the
  B2 evaluator, and the roadmap page reflects this plan.

### Stacked pull requests

| Order | Branch                             | Scope                                                      |
| ----- | ---------------------------------- | ---------------------------------------------------------- |
| C1    | `refactor/student-ui-01-states`    | Shared empty and loading states and adoption.              |
| C2    | `feat/student-ui-02-notifications` | Table, producers, bell inbox, mark-read.                   |
| C3    | `feat/student-ui-03-compass`       | Persistence, streaming route, tools, usage, model setting. |
| C4    | `feat/student-ui-04-landing`       | Landing refresh and data-driven searches.                  |
| C5    | `feat/student-ui-05-onboarding`    | Onboarding and dashboard polish, roadmap update.           |

### Verification

Database tests for own-row access on notifications and assistant tables.
Component tests for the shared states and the bell. Playwright for a student
who receives a notification after a plan risk appears and for one Compass
turn with a mocked model response.

## Project D: campus map interface

Independent of the other projects. Scheduled last.

- Split `room-finder.tsx` into a search panel, a layers panel, a directions
  panel and a floor stack, each with its own state, shown one at a time.
- Progressive disclosure: search first, layers and directions behind explicit
  controls, journey steps only during a route.
- Floor controls show the floor name, not the reference code.
- Admin tool rail groups the nine tools and moves keyboard hints to a help
  sheet.
- Remove the Preview badge once the above lands, and update the roadmap.

## Working agreement for the stack

- Branch from the previous branch in the sequence, not from `main`. Rebase
  forward when an earlier branch changes.
- Commit subjects follow `feat:`, `fix:` and `refactor:` as in
  [Contributing](../CONTRIBUTING.md).
- Nothing is pushed until the local stack is complete for the current project.
  Pushing happens in order, and each pull request targets the branch below it
  until that branch merges.
- Every branch passes `pnpm verify` and, for database changes, `pnpm db:reset`,
  `pnpm db:test`, `pnpm db:lint` and `pnpm db:types` before the next branch
  starts.
- Local work does not authorise hosted migrations, storage bucket changes or
  deployment. The hosted cutover is a separate, explicit step after A8.
