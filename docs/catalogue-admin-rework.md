# Catalogue admin rework

Status: in progress. This document carries the work left on the catalogue
administration interface and the import pipeline after A7, and the findings
behind it. Fold each item into [architecture](architecture.md) or
[catalogue operations](catalogue-operations.md) as it lands, and delete this
document when the list is empty.

## Why this exists

A5 to A7 specified data flow and routes and said nothing about reusing the
existing component kit. The rebuild was executed literally: around 9,300 lines
of admin interface across 69 files were removed and replaced with roughly 3,100
lines that hand-roll tables, selects, labels, diffs and loading states the
repository already owns. Four finished components were deleted for schema
reasons and never replaced. The B and C projects will repeat this unless the
reuse list below is part of their scope.

## Reuse list

Read [UI conventions](../apps/web/ui/AGENTS.md) before touching any of this.
Nothing in `apps/web/ui/admin/` or `apps/web/ui/common/` is a second primitive
library, and neither is a reason to write a third.

| Need                           | Use                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| A list of catalogue records    | `ui/admin/catalogue-table/` `DataTableShell`, whose CSS grid owns the column widths         |
| Any other table                | `ui/common/data-table.tsx` `DataTableShell` around a primitive `Table` with a minimum width |
| An activity or version history | A timeline, as `CourseImportHistory` and `CatalogueReviewHistory` were. Not a table         |
| A row identity                 | `CatalogueIdentity`                                                                         |
| A whole-row link               | `ui/common/linked-table-row.tsx`                                                            |
| Search and filtering           | `ui/common/filter-bar.tsx` above the table, never inside it                                 |
| Sorting, paging                | `ui/common/sort-menu.tsx`, `ui/common/pagination.tsx`                                       |
| A choice or boolean field      | `ui/common/option-picker.tsx`, `ui/common/select-field.tsx`                                 |
| A labelled field               | `@coursemap/ui/primitives/field`                                                            |
| Long-form or section forms     | `ui/common/section-navigation.tsx`                                                          |
| A destructive bulk action      | `ui/common/confirm-dialog.tsx`                                                              |
| Empty, loading, error          | `ui/admin/catalogue-table/catalogue-{empty,loading,error}.tsx`                              |
| A status label                 | `ui/common/status-pill.tsx`, or a tone map plus `badgeVariantForTone`                       |
| JSON or source display         | `ui/common/json-code.tsx`                                                                   |

Rules that the rebuild broke and that reviews should enforce: no `<ul>` or
`<li>` standing in for a table, no hand-rolled `<select>` or `<label>`, no
raw database enum shown to a reader, and every view carries empty, loading and
error states.

## Done

Branch `fix/catalogue-security-and-imports`, then
`refactor/admin-catalogue-tables` stacked on it.

- Catalogue writes are gated on `catalogue.write` or `imports.manage`.
  Previously `private.can_manage_catalogue()` accepted `courses.read_drafts`,
  which the default `user` role holds, so any signed-in account could publish
  arbitrary content. Covered by `supabase/tests/database/catalogue_write_permissions.sql`.
- `requirement_conditions.item_kind` holds a referenced item to the kind the
  condition expects, and the requirement-mode check no longer evaluates to null.
- Extraction contracts tolerate an absent nullable key. One missing
  `sourceUpdatedAt` previously discarded an entire model response.
- The structure prompt maps ANU requirement wording to typed conditions.
  Bachelor of Computing went from one `unit_total` plus eleven `unmodelledText`
  entries to twelve typed conditions and thirty-six resolved options.
- Unit-bearing conditions accept a maximum with no minimum, which ANU states
  as "a maximum of 60 units may come from 1000-level courses".
- `revalidatePath` no longer receives a query string, so admin actions take
  effect without a reload. The record page tabs are controlled from the URL.
  The directory lets `FilterBar` bind to the URL rather than navigating per
  keystroke. The ten admin `error.tsx` boundaries are restored.
- Import runs, records and pipeline stages render as tables, built from the
  components they replaced: the record table uses `LinkedTableRow`,
  `CatalogueIdentity` and `CatalogueRowActions` over the `data-imports` grid,
  and the run and stage tables use the ordinary shell around a primitive
  table. The record history is a timeline again, with snapshots and
  publications merged into one ordered story.
- The review diff walks into a change and lists the fields that differ, through
  `CatalogueValue`, instead of two blocks of JSON.
- The artefact viewer is restored, so artefacts are read in place with their
  attempt picker and highlighting rather than downloaded.
- The requirement tree renders. `ui/requirements` covers the whole condition
  vocabulary, `published_structure_detail` gives structures a published read
  they never had, and one `StructureDetailView` serves both the admin preview
  and a new student page, so a reviewer judges a record as a student sees it.
- The directory row is a whole target with an actions menu, the loading
  skeletons draw the table that follows them, publish blockers are an Alert,
  record pages have an error boundary, and the review changes are a decision
  table.
- The runs page searches, filters, sorts and pages, and watches an active run
  through four counters rather than refetching every run and target every four
  seconds.
- The imports page is one table of records across every run rather than a run
  list stacked over one run's records. The run is a column and a filter, so a
  record is found by its code rather than by guessing which batch carried it,
  and search, outcome, sort and paging act on the records themselves. The
  section tabs carry an icon each and the record tabs dropped the open-flag
  count, which repeated the panel below and moved the tabs as flags resolved.
- Four pipeline defects are closed: a manual edit no longer clears the
  publication gate, structure summary fields are stored rather than parsed and
  discarded, a discarded model extraction raises a blocking flag and an error
  code instead of landing `ready` in silence, and the structure merge accepts
  the model field by field as the course merge already did. A stuck target can
  be recovered without a hand-written statement.

## Left to do

### 1. Restore what was deleted

Each was removed for schema reasons, not design reasons. Recover with
`git show 80b95de^:<path>` and re-point the types at `CatalogueSnapshotWrite`.

Two pieces the artefact viewer depended on are still missing and are worth
having back on their own account: `database-scroll-preview.tsx`, the viewport's
custom scrollbar, and `import-persistence-decision.tsx`, which read a change
set rather than printing it as JSON.

- `lib/coursemap/course-review-sections.ts`, the per-field registry. See item 3.

### 2. Review granularity

The diff and the decision table have landed. What remains is upstream:
`lib/catalogue-import/changes.ts` records a whole collection as one row, so a
reviewer accepts or rejects every field in it together. The diff shows which
fields differ, but resolving them one by one needs the change rows themselves
to be finer. Deliberately deferred until the interface settled.

### 3. Editing

Owned by a separate task; see the editor notes in that branch. In summary:
around fifteen collapsed accordions over `Object.entries()` with one global
save, labels derived by regex, the column set taken from `rows[0]`, a
hand-rolled `<select>`, evidence fields editable, rows titled "Item N", and a
boolean detector that cannot match because it tests a lowercase pattern against
an already capitalised label. Structure requirement trees render as raw JSON
until the editor covers `structure_set`, `tagged_units` and `elective_units`.

### 4. Remaining list and table work

Most of this has landed. What is left:

- `record-header.tsx` shows publish blockers as the faintest text on the page
  and repeats them in a `title` attribute. They belong in an `Alert`.
- Record pages under `/admin/<kind>/[code]` still have no error boundary.
  `CatalogueError`'s copy is list-specific, so this needs a record variant
  rather than the same component.

### 5. Pipeline and schema

- A manual edit bypasses the publication gate. `catalogue_publish_blockers`
  finds blockers through the draft's `import_target_id`, and
  `manual-snapshot.ts` never sets one, so any trivial edit clears the gate.
  Carry the originating target through, or resolve blockers through the item
  year's latest target.
- `summaryFields` are parsed, hashed into the projection and never persisted.
  The table was dropped in `20260918150000_requirements.sql` and nothing
  replaced it. Every programme import loses them.
- Discarding a model extraction is silent: the target still lands `ready` with
  a null `error_code`. Emit a blocking flag and an error code.
  `kinds/structure/model-response-error.ts` explains truncation and is imported
  by nothing.
- `kinds/structure/adapter.ts` accepts or rejects the whole model response.
  Make it field-level as `kinds/course/merge.ts` already is, so a bad fee does
  not cost the requirement tree.
- `persist-snapshot.ts` drops unresolvable options, references and related
  courses with a bare `continue`. Record them.
- A failed target stays `queued` and the active-target index then blocks every
  retry, with no interface path out. `cancel_catalogue_import` needs an
  administrator claim, so recovery is currently a manual SQL statement.
- `catalogue_items` cannot be deleted: the immutability trigger fires on delete
  although its comment says cascades pass. Combined with placeholder creation
  from any regex-valid code, one hallucinated code is permanent.
- `requirement_item_references` stays empty for structures.
- Consider `json_schema` structured output in `openrouter.ts`. Deliberately not
  done: the schema uses `$ref` and `$defs`, the configured model is
  `google/gemini-3.1-flash-lite`, and `provider.require_parameters` would turn a
  soft failure into a hard one. Revisit with a model that supports it.

### 6. Tests the plan promised, still missing

This is the largest outstanding item and the one that blocks A8.

No pgTAP covers `catalogue_import_targets`, `catalogue_import_changes`,
`catalogue_directory_entries`, `catalogue_directory_statuses`,
`catalogue_import_stages`, `catalogue_import_artifacts`, `catalogue_extractions`,
`start_catalogue_import`, `cancel_catalogue_import`,
`resolve_catalogue_import_change`, `catalogue_publish_blockers`,
`publish_catalogue_snapshot`, `unpublish_catalogue_item_year`,
`discard_catalogue_draft` or `admin_snapshot_projection`. The plan asks
specifically for a sealed snapshot, a stale-baseline Apply and a blocked
Publish.

## Working locally

- Use `pnpm dev:local`. `apps/web/.env.local` points at the hosted project,
  which still carries the pre-redesign schema, so `pnpm dev` fails with
  `PGRST205` against tables this branch removed. None of the fixes above are
  live there; they travel with the cutover after A8.
- `pnpm db:reset` drops the storage buckets and does not recreate them, so
  imports then fail with an opaque gateway error. Recreate
  `course-import-artifacts` from `supabase/config.toml`.
- `package.json` still exposes `course-import:benchmark`, whose script was
  deleted.

## A note on matching the old interface

Before rebuilding a surface, read the component it replaced rather than
inferring its shape from the data. Two corrections already came from doing
this: the pipeline table uses the ordinary table shell, not the catalogue grid,
and version history is a timeline, not a table. `git show 80b95de^:<path>` and
`git log --diff-filter=D --name-only` find them.

## Before A8

A8 squashes the migration history into a baseline, which states that the
schema is the intended one. Items 5 and 6 above land first, along with the
renames the plan deferred: the surviving `academic_structure_*` child tables,
`published_catalogue_item` (today `published_course_detail`, with no structure
equivalent at all), and `published_requirement_graph`, which is still keyed on
a course code.
