# Year-wide course imports

Status: the initial source-first importer is implemented locally. The broader year-wide design below remains a roadmap. Scope starts with courses for 2026; programmes, majors, minors, specialisations and later years remain separate imports.

## Initial release

The course directory links to a dedicated **Import courses** page. Choose up to all missing courses from the selected year's current ANU listing using a slider, exact number or 10%, 25%, 50% and All presets. The full-width cost panel shows Estimated, Min and Max and stays mounted while selections change. A preview loads availability and pricing once; selection and spending-limit changes update locally without another request. Stale model prices refresh from OpenRouter's free public catalogue before the estimate is shown. Defaults are 100 courses and US$0.50. Already imported records, published records and existing drafts are skipped, including manual drafts. Selection currently follows course-code order; degree-scoped discovery remains later work.

Metadata is copied by a deterministic Markdown parser. A deliberately small prerequisite grammar handles straightforward completion lists and exclusions without a paid call. More complex requisite sections use a compact, per-course OpenRouter request capped at 1,500 output tokens and 20,000 input bytes. This release uses ordinary requests, not OpenRouter's discounted asynchronous Batch API or grouped model requests. The default selection is 100 courses, with no product cap on the manifest. Selecting All still creates independent course jobs, not one large model response.

Estimated cost uses the average of at least five successful source-first imports at the same current model prices from the last 30 days. Until those exist, Gemini 3.1 Flash Lite uses a clearly labelled provisional projection from one measured complex request. Other models show no estimate until samples exist. Min assumes no paid interpretation is required; Max assumes every selected course uses the full request allowance. These are planning figures, not a quote or guaranteed range. Budget reservations always use the conservative allowance, independently of the estimated figure.

Normalised `catalogue_course_runs` and `catalogue_course_run_items` tables preserve the manifest, initiator, model-price snapshot, reservations, actual costs and publication pointers. Each item uses the existing sync lease, immutable artefacts, source version, draft and field-review workflow. Spending reservations are serialised under the run lock. Unknown costs or an exhausted budget pause new paid work. Cancellation releases unsent courses; accepted requests may still complete and incur charges.

With Vercel Queues configured, a completed worker dispatches the next item. In local inline mode, the open import page advances one item at a time and polls every second while actively importing (every three seconds when idle); a closed tab leaves a durable manifest that can continue later. A stale dispatch marker becomes eligible after ten minutes. Completed sync deliveries are no-ops, and uncertain paid outcomes are never automatically submitted again.

Starting an import switches to a result page with Overview, Courses and Review tabs directly below the breadcrumb. Tabs use the `tab` query parameter, support browser history and reuse prefetched course results. Progress, analysis and spending appear on Overview, including after completion and when reopening a run. Purple segments show published courses and clean drafts, orange shows review items, red shows failures and unfilled space represents work not imported. The count shows actual imports, excluding stopped jobs. Courses lists the entire saved manifest in pages of 25, with code/title search, outcome filters, direct workspace links, actual AI charges and expandable validation issues. Directory filters do not hide these results. Closing or completing a run refreshes the catalogue directory.

Activity has a **Bulk imports** tab with paginated saved runs across years, search by year or course code, and status/year filters. Each run has a permanent URL. Review shows all grouped publication issues in a searchable table; selecting an affected-course count opens Courses filtered to that issue across the entire run. The existing Syncs tab retains every individual sync; its technical `applied` status means data was saved, not necessarily published.

The progress legend separates published courses, clean saved drafts, candidates needing review, failed imports and stopped work. Saving a clean draft with publication disabled is not a validation issue. Overview shows actual spend, budget remaining and money reserved for pending AI requests. A zero reservation is hidden; it does not mean the import was free.

**Auto-publish** is opt-in and requires both import and course-writing permissions. It publishes the whole candidate only when all positive source checks pass and no flags or unresolved first-read checks remain. It never publishes a reduced snapshot with omitted fields or a replacement manual-check rule to raise the success rate. A successful automatic publication removes the clean draft. Uncertain optional fields, complex rule interpretations, unknown availability and explicit administrator review markers hold the whole candidate. Original source artefacts and drafts remain available for review.

Previously partially published local records can still retain draft work. Their publication remains searchable through the Published directory filter, and their badges/result rows identify the draft separately. These older drafts are preserved; the stricter policy applies to new automatic publications.

The parser recognises unit ranges, per-unit fees, numbered outcomes, additional assessment formats, genuine not-offered pages, historical course references, consent requirements and mandatory GPA wording outside the main requisite heading. Navigation lists stay out of descriptions. Advisory assumed knowledge copied from ANU is informational; it does not falsely become a hard eligibility issue solely because it is prose.

Supporting sections such as Preliminary Reading, Work Integrated Learning and Other Information retain labelled source text under study information and reading. Printed materials-fee notes do not become course descriptions or guessed charges. Hard eligibility wording outside the requisite heading still blocks publication when unsupported.

The parser preserves recognised ANU contribution-band codes, including 12, 14, 34 and 4B, without guessing a student's cohort or dollar amount. See [ANU's contribution-band allocation table](https://www.anu.edu.au/student-contributions?tb=1). Numeric codes remain literal codes; alphanumeric codes retain their source label.

Exact prerequisite templates now cover programme alternatives, consecutive unit requirements, completed versus concurrent exclusions, and conditional consent exceptions. Each rule must consume its whole source clause. Subject unions, minor admission and ambiguous degree-specific conditions remain held. Saved-source regression checks can verify a parser fix without another AI charge, but do not rewrite existing drafts or publish them automatically.

The service shares the existing sealed-version publication transaction, records a source actor without a fabricated editing session, preserves source provenance and expires public cache tags. Existing published records and edited drafts are skipped by new manifests.

Migrations 034 and 035 and regenerated database types are included. Migration 035 removes the 100-course database constraint. Local verification used an isolated copy of the local database, not a reset of the existing stack. No hosted migration or deployment has been performed.

## Student and administrator outcome

An administrator chooses a year and starts one import run. Coursemap discovers the complete ANU listing, fetches source pages, parses straightforward fields, submits compact interpretation requests and validates the resulting course records. Verified records can publish automatically when that run uses the **Publish verified courses** mode. Other records appear in a field-level review queue with their source wording and a reason.

The run page shows total discovered, fetched, interpreted, verified, published, unchanged, awaiting review and failed records, with actual model spend and the remaining reserved budget. These counts refer to records, not requests. Publishing a record is an atomic version operation, even though its review is field-specific.

A run is a durable job containing smaller chunks. 'Import the year' does not mean one enormous model request or an open browser tab. Workers can stop and resume without paying to repeat completed extraction. Coursemap's own source and result storage retains context; model caching is only a cost optimisation.

## Reuse the existing catalogue lifecycle

Keep the existing record/year identities, immutable source versions, artefact storage, three-way source comparison, drafts, review units, publication sealing and public cache invalidation. Extend the current adapter/processor boundary rather than introducing an alternative publication path.

The existing individual full-model sync sends the whole source page and complete extraction schema to the model. The processor operates under one record's lease, and publication is an authenticated draft operation. The source-first path now shares this lifecycle; grouped requests and the provider Batch lifecycle remain future work.

The existing first-read classifier treats missing confidence as acceptable in some cases. That UI convention is not evidence for automatic publication. A new independent gate must require positive, recorded verification of required fields and source coverage. The pilot demonstrated that a structurally valid, confident model output can still invent prerequisite scope.

## Processing stages

1. **Discover.** Refresh the selected year's ANU course listing and freeze the run's record manifest. Capture listing provenance. Check that discovery completed before claiming a whole-year run. A missing listing or failed page never removes a publication.
2. **Fetch.** Fetch source pages with bounded concurrency and backoff. Save original HTML, content hash, retrieval time, selected year and source URL before transformation. Reject mismatched codes/years, error shells and incomplete source pages. Retain failures separately from interpretation uncertainty.
3. **Parse.** Extract structured metadata and copy printed prose in code: identity, units, title, description, school/college, delivery, selected-year offerings, fees, assessment, learning outcomes and source sections. Every parser writes field evidence and a parser outcome. Distinguish absent-on-source, not-offered, unsupported-source-layout and parse failure; never fill uncertainty with invented defaults. Linked class summaries are not part of this run.
4. **Interpret.** Send only sections that need semantic interpretation. Initially these are requisite rules; variable unit constraints or other unsupported expressions need separately costed contracts. Keep original wording outside the model response. Return compact typed rules, unsupported clauses and field-specific issues. Map the compact contract to the existing domain types, including mark/GPA, permission, programme, commencement, concurrency and conditional scopes. Unsupported conditions remain review blockers.
5. **Validate.** Assemble the existing complete course contract. Validate identity, required field coverage, units, references, selected-year periods, source evidence and logical scope. Source sections containing eligibility constraints cannot silently produce empty rules. Check code omissions, duplicate responses and facts leaking between courses. Run independent ambiguity and contradiction checks. Model confidence alone never passes a field.
6. **Stage.** Persist each completed record through the current source-version and draft workflow. Reconcile changes against its previous ANU source and current local values. Preserve manual overrides, draft edits and pending reviews. One bad course must not discard the valid results for its neighbours.
7. **Decide.** Produce an audited eligibility decision for each candidate revision. Publish eligible candidates only when the run's publication mode authorises it; otherwise leave verified drafts. Record review reasons by field and retain model/parser artefacts for diagnosis.
8. **Report.** Reconcile the run manifest with terminal outcomes. A run can finish with review items and failures; show 'Finished with review needed' rather than equating all fetched records with successful publication. Surface incomplete discovery separately.

## Review and saved-source repairs

Overview allows the initiating administrator with course-write permission to change auto-publication for remaining work. Publish verified drafts checks saved, untouched candidates in batches of ten using the same strict publication gates, without another AI request. It also works after a run stops. Edited or uncertain drafts remain held. Review opens affected courses with their issues expanded and links to the course Changes page; Grouped issues provides an optional aggregate view. Counts for review reasons can overlap when a course has several flags. Overview reports publication and review rates over imported courses, elapsed time including pauses, imports per minute and average confirmed costs.

ANU's First Semester and Second Semester labels resolve against the calendar's S1 and S2 identities, even when the calendar uses Semester 1 and Semester 2 as names. The saved-source repair helper can restore offerings without a new model request. It only considers untouched, unpublished drafts still based on the run's original source version. Edited drafts and other review flags are preserved, and repair never publishes a course.

On the All fields table, confidence appears as a chip, with `--` when no confidence was supplied. Collection summaries expand to show every item. Edit opens a field-specific dialog using the existing typed editor and revision-checked draft autosave.

## Automatic publication policy

The first release should publish only newly populated, untouched course records with every required verification gate passed. Existing published records and meaningful manual drafts are reviewed through the existing comparison flow. This protects the useful catalogue while we calibrate the new pipeline.

A candidate must have:

- A validated source identity and selected year, complete source retrieval, and known parser/schema versions.
- Verified coverage of the full production import contract, including an explicit source-supported absence where appropriate.
- No extraction errors, unresolved required sections, unknown requisite scope, unsupported conditions, missing identity resolution or contradictions.
- Source-backed units and offerings. A source-confirmed not-offered course can publish as not offered; an unknown offering status does not become a guessed session.
- No unresolved field review, conflict, manual override or unrelated draft edit.
- A current draft revision, unchanged source hash and an unrevoked run publication mode when the publication transaction executes.

Reuse publication's revision checks, transaction, immutable version sealing, changelog and cache invalidation. Persist the verification decision, gate version, initiating administrator and run identity. Do not fabricate a human editing session to call the existing manual publisher; extract a shared transaction/service with distinct authenticated manual and authorised run actors.

Initially, any unresolved field holds the whole new record. Review remains field-specific, so correcting one issue does not require re-importing everything. Later, optional informational uncertainty could be omitted visibly and reviewed separately, but eligibility, units, identity and offerings must never publish with guessed facts. That later relaxation needs an explicit field policy and student display behaviour, not a blanket confidence threshold.

Automatic updates to already published records are a later phase. They must respect source baselines and durable Keep current decisions. Source disappearance never automatically unpublishes a record.

## Grouping, caching and batch processing

Separate two optimisations:

- **Grouped interpretation:** a small request contains several course excerpts and one shared instruction/schema prefix. Start with 5 to 10 courses, then group by token budget and rule complexity rather than a fixed count. Keep complex cases in smaller groups. Response identities must exactly match the input manifest.
- **OpenRouter Batch API:** submits many independent grouped requests for discounted asynchronous execution. Store the provider batch ID, each custom request ID, model, price snapshot and per-request usage. Provider processing may take up to 24 hours; do not retain a short record-worker lease while waiting. Persist waiting state and poll through resumable queue work.

Keep shared instructions stable and use caching where supported. Different year contexts, contract versions or model choices use distinct cache keys. Do not append previously generated course JSON to each later request. Batch jobs may process concurrently, so estimate spend assuming no cache hits.

On completion, store provider results before parsing and attach each record to its source hash and contract version. Check response truncation, missing identities, malformed rules and unsupported fields. Retry only failed requests or affected records, not the whole year. Preserve successful results from mixed-success jobs.

Use request fingerprints built from source sections, source context, parser/contract versions and model configuration. An unchanged valid result is reusable; a corrected contract or source change invalidates it. Derive the final record comparison from semantic content rather than HTTP retrieval timestamps.

## Budget and recovery

Set a monetary budget when creating the run. Reserve a conservative allowance before submitting each provider request, including output caps and retry allowance. Settle reservations from returned usage and stop new submissions if costs cannot be reconciled. Missing cost is unknown, not zero. Pausing or cancelling stops unsent work; already accepted provider jobs may still incur charges.

Persist run cancellation, queue leases, attempts and active-provider state. Resume from stored stages. A lost submit response is an unknown outcome: reconcile with the provider or supported idempotency mechanism before resubmitting. Do not assume a custom request ID provides submission idempotency.

The pilot's approximately US$0.36 projection for 3,000 courses at batch prices covers only requisite interpretation on eight selected examples. It is not the whole-year budget. Price a broader end-to-end sample first and include unsupported fields, retries, cold caches and fees.

## Database and application changes

Add normalised run, run-item and provider-request/batch records with foreign keys to existing catalogue records and syncs. Store queryable state, reservation/settlement amounts, source hash, parser version, expected revision, authorised publication mode and initiating user. Provider payloads and responses belong in the existing artefact store.

New privileged routes and tables need catalogue operations permissions, explicit RLS/grants and local database tests. Regenerate database types after a forward-only migration. Ordinary student clients must never start runs or access private artefacts. Credentials remain server-side. No hosted migration or bulk publication is part of implementing this proposal locally.

The review page should group by issue rather than require opening thousands of course pages: ambiguous prerequisites, unknown offerings, variable units, unresolved identities, incomplete source and conflicting local edits. Show current versus incoming value, exact source excerpt and URL, affected year, and the available field decisions. Corrections should revalidate the assembled record without a paid resync.

## Delivery slices and acceptance

| Slice | Deliverable                                                           | Evidence required                                                                                                                                            |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Independent source-scope safeguard, captured fixtures and this design | Confident guessed prerequisite becomes a blocking hard unknown; explicit grouping remains unaffected                                                         |
| 2     | Deterministic course parser and complete field evidence               | Wider fixture corpus covers ordinary and unusual layouts, selected-year offerings and field coverage; unsupported layouts fail explicitly                    |
| 3     | Compact typed interpretation and assembly                             | Fixed holdout corpus covers complex requisites; source fidelity and full contract checks pass; cost is measured for equivalent complete records              |
| 4     | Durable year-run coordinator and OpenRouter Batch lifecycle           | Local database tests prove per-record outcomes, retries, cancellation, unknown submission recovery and budget settlement                                     |
| 5     | Automatic publication service and review UI                           | Untouched verified courses publish; critical uncertainty, stale revisions, conflicts and manual drafts remain held; public reads expose only sealed versions |
| 6     | Authorised hosted canary, then 2026 run                               | A small end-to-end source-reviewed sample passes before the complete manifest runs; counts, cost and exceptions reconcile                                    |

The initial release includes slice 1, a conservative parser/assembly path, durable run coordination and guarded automatic publication. The broader slices are not all complete. The initial guard recognises plain mixed AND/OR prerequisite sentences without explicit scope markers. It is deliberately conservative and is not a complete prerequisite grammar or automatic publication gate. Old provider artefacts retain the guessed model output; finalised candidates withhold it and retain the source wording as a hard unknown. The parser version is bumped so new work is distinguishable from previous finalisation.

Programmes retain the existing individual extraction and manual publication workflow. Majors, minors and specialisations use the independently verified bulk path described below.

## Majors, minors and specialisations

Bulk imports also support majors, minors and specialisations. Choose a type on
New import or open Import from its catalogue directory. Existing imports and
manual drafts are excluded, and each saved run fixes one type and year. The
history has a Type filter and result links open the correct catalogue workspace.
The historical API path and `catalogue_course_runs` table names are retained so
saved course imports and URLs continue to work. Migration 036 adds the run kind
and checks that manifest items match the run's kind, year and sync record.

Structure runs use `anu-structure-source-first.v4`. Labelled metadata, introduction,
learning outcomes, advice and relevant degree links are copied from the source.
The deterministic grammar verifies explicit course lists, compulsory slots,
minimum and maximum unit pools, recognised subject and level allocations and
bounded alternatives. It checks allocations against the source's total units.
Unrecognised clauses, overlapping options and unsupported completion overrides
remain held. Unsupported requirements go to the model with the original source
retained for review; model confidence cannot authorise publication.

Admission, placement and enrolment policies can publish as complete verbatim
ANU text when the completion tree is independently verified. Those conditions
remain visible and are not claimed to be automatically checked by the planner.
Named relationships are resolved only against a unique exact identity from the
same year's source directory.

The captured 2026 audit corpus contains 88 completed records: 28 majors, 30 minors
and 30 specialisations. Saved-source replay verified 49 candidates (55.7%): 14
majors, 15 minors and 20 specialisations. The other 39 remain held. This is local
replay evidence, not a production publication count or a guaranteed future rate.
Database regressions compare every replay-published record with its source,
including unit bounds, course choices and retained policy text. Existing published
versions are not rewritten by these changes. An older SOFT-MAJ preview snapshot
with missing enrolment exclusions needs a separate reviewed data correction.

Structure requests have a 40,000-byte input bound and a 4,000-token output bound.
The run reserves this kind's allowance before each paid request. Estimates use
completed imports of the same kind, parser and model prices. The single-course
fallback estimate is never applied to structures. Until enough structure samples
exist, the estimated value is unavailable, with the conservative maximum shown.

Publishing structures requires `catalogue.write` as well as `imports.manage`;
course publication still requires `courses.write`. Saved verified drafts can be
published after stopping a run without another AI request. Edited drafts and
ambiguous candidates remain held. Programmes continue to use their existing
individual import workflow.
