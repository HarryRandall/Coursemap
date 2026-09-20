# Documentation

## Current guides

- [Code conventions](conventions.md): naming, comments, modules and file placement.
- [Architecture](architecture.md): application boundaries and the data model.
- [Catalogue operations](catalogue-operations.md): importing, reviewing, editing and publishing catalogue records.
- [Environment template](../apps/web/.env.example): required settings, optional services and defaults.
- [Database setup](../supabase/README.md): local services and database operations.
- [Contributing](../CONTRIBUTING.md): workflow and verification requirements.

## Proposals

- [Catalogue admin rework](catalogue-admin-rework.md): the component reuse list and the interface, pipeline and test work left after A7.
- [Redesign plan](redesign-plan.md): decisions, target model and stacked pull request sequence for the catalogue schema and import redesign, prerequisites, student interface and campus map.

Keep current operating instructions in the guides and label proposals explicitly.
When work lands, move lasting decisions into the relevant guide and remove the
superseded proposal or migration notes. Git history retains the old documents;
do not maintain a separate archive or present old verification as current.
