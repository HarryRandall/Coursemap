# Catalogue operations

How administrators bring ANU catalogue records into Coursemap and take them to
students. The same steps apply to courses, programmes, majors, minors and
specialisations; each has its own section under **Admin**.

## Concepts

- **Record**: one code in one academic year, for example COMP1100 in 2026.
- **Snapshot**: an immutable version of a record's content. Every import or
  manual edit creates a new snapshot; nothing is overwritten.
- **Draft**: the snapshot being prepared. A record has at most one draft, and
  only while it differs from what is published.
- **Published**: the snapshot students see. Publishing moves the draft into
  this slot and clears the draft.

## Import a record

1. Open the kind's section (for example **Admin › Courses**) and pick the
   academic year. **Refresh listing** fetches the ANU directory for that year;
   the table then shows every listed code with its workflow status.
2. Select up to ten codes and choose **Import selected**. A run starts and
   processes each target through fetch, Markdown normalisation, deterministic
   parsing, model extraction, validation and snapshot assembly. **Import
   runs** shows progress, cost and every stage and artefact per target.
3. A target finishes as one of:
   - **Unchanged**: the page content matches the current draft or published
     snapshot. Nothing to do.
   - **Needs review**: a candidate snapshot exists and differs. Open the record
     to review.
   - **Failed**: the stage that failed and its error are shown. Retryable
     failures (network, provider) retry up to five times automatically;
     others stop immediately.

A first import for a record has nothing to compare against, so the candidate
becomes the draft straight away and its fields are recorded as accepted.

## Review a candidate

On the record's **Review** tab, each import lists:

- **Changes**: every field or section that differs from the baseline, with the
  current and imported values and the source excerpt where the parser recorded
  one. Scalars appear one by one; collections (sessions, fees, outcomes,
  sections) and requirement rules appear as whole sections. Choose **Accept**
  or **Reject** for each, or use **Accept all** / **Reject all**.
- **Flags**: notes the parser raised. Warnings inform; errors block
  publication until acknowledged. Acknowledging a blocking flag needs a note
  saying why publication may proceed.

**Apply to draft** becomes available once every change is decided. It writes a
new draft combining the current content with the accepted changes. If
everything was accepted, the candidate itself becomes the draft. Apply refuses
when the record changed since the import ran; start a new import in that case.

## Edit by hand

The **Edit** tab shows every section of the current draft (or the published
snapshot when there is no draft): details, offering, unit options, fees,
areas of interest, attributes, related courses, sessions, learning outcomes,
assessment, and the requisite rules for courses; details, sections, learning
outcomes, fees and related structures for programmes and their parts.

Course requisite rules use the drag-and-drop tree editor. Structure completion
requirements are shown as recorded until their editor lands.

**Save as draft** creates a new manual snapshot based on the one you edited
and makes it the draft. Open import changes on the fields you edited close as
rejected, since you have decided those values directly. Saving refuses if the
record changed while you were editing.

## Preview and publish

**Preview** renders the draft (or the published snapshot) exactly as students
see it. **Publish draft** is enabled when there is a draft, no import review
has open changes, and no blocking flag is open on the draft's import. The
disabled button explains what is missing. **Unpublish** withdraws the record
from students; the snapshot stays in history.

## History

The **History** tab lists every snapshot with its origin (import or manual),
the run that produced it, and which one is published or draft, plus the
publication log. **Restore as draft** copies a historical snapshot into a new
manual draft. **Discard** clears the draft pointer without deleting anything.

## Models and cost

Imports call the model chosen in **Admin › Dashboard** settings. Each run
records tokens and cost per target. Identical page content with an identical
prompt reuses the recorded model response rather than paying again.

Large programme pages can exhaust a small model's output budget; the target
detail then says the model ran out of output tokens and the import keeps the
deterministic data. Choose a model with a larger output budget for those.

## Configuration

Local development processes imports in the web process with the local
database and needs only `OPENROUTER_API_KEY`. Hosted environments set
`COURSEMAP_IMPORT_DATABASE_URL` and `COURSEMAP_QUEUE_IMPORTS_ENABLED=true` so
targets run through Vercel Queues; see `apps/web/.env.example`.
