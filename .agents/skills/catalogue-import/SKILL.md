---
name: catalogue-import
description: Import, reconcile and verify ANU catalogue data for Coursemap with provenance and reviewable exceptions. Use when adding a catalogue year, courses, offerings, prerequisite rules, degree structures, university calendar key dates, source parsers or synchronisation jobs.
---

# Catalogue import

## Overview

Turn authoritative ANU source material into idempotent, versioned Coursemap records. Never promote prototype fixtures or inferred values as authoritative catalogue data.

## Workflow

1. Identify the authoritative source URL, catalogue year, retrieval time, licence constraints and source format.
2. Save source metadata and a content hash before transforming records.
3. Parse into typed staging records and validate codes, units, dates, rule structure and references.
4. Upsert through stable natural keys inside a transaction. Do not delete previously published data merely because a source is temporarily incomplete.
5. Send ambiguities, conflicts and unsupported rule expressions to a review queue with the original source fragment.
6. Compare created, changed, unchanged, rejected and missing counts against the previous successful run.
7. For courses and academic structures, imported candidates stay drafts until an administrator reviews the recorded changes, applies them and publishes. The calendar manifest importer publishes validated events directly; inspect diagnostics and removals before running it. See `docs/architecture.md` and `docs/catalogue-operations.md`.
8. Add a new kind by writing an adapter under `apps/web/lib/catalogue-import/kinds/` that satisfies `CatalogueKindAdapter` and mapping its projection to `CatalogueSnapshotWrite`; the processor, review and workspace need no changes.

## Data rules

- Key course identity separately from year-specific course records and immutable snapshots.
- Model teaching periods and offerings explicitly.
- Preserve nested prerequisite logic using rule groups and conditions. Do not flatten `all of`, `any of` and minimum-count rules into a single list.
- Version degree and programme structures independently from a student's plan.
- Track each sync run and record-level source provenance.
- Keep import parsers outside request handlers so they can be tested and rerun safely.

## Verification

- Unit-test each parser with captured fixtures that contain source dates and provenance.
- Check broken course references, duplicate natural keys, impossible units and malformed rule trees.
- Re-run the same input and confirm the second run is a no-op.
- Review a sample of transformed records against the original source before publishing.
- Keep captured test fixtures under `apps/web/tests/fixtures` with their source dates and provenance; never serve fixture data from the production path.
