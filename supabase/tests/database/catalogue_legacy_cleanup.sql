begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

select extensions.hasnt_table(
  'public',
  'catalogue_review_items',
  'the retired generic catalogue review queue is absent'
);

select extensions.hasnt_table(
  'public',
  'catalogue_import_diagnostics',
  'the retired generic catalogue diagnostics table is absent'
);

select extensions.hasnt_function(
  'public',
  'catalogue_change_issue_codes',
  array[]::text[],
  'the retired generic catalogue change classifier is absent'
);

select extensions.hasnt_table(
  'public',
  'catalogue_years',
  'the legacy catalogue year registry is absent'
);

select extensions.hasnt_table(
  'public',
  'catalogue_source_documents',
  'the legacy catalogue source document table is absent'
);

-- The shared pipeline reuses the catalogue_import_runs name; the legacy
-- table is recognisable by its per-item child, which stays gone.
select extensions.hasnt_table(
  'public',
  'catalogue_import_items',
  'the legacy generic import item table is absent'
);

select extensions.hasnt_table(
  'public',
  'catalogue_import_items',
  'the legacy generic import item table is absent'
);

select extensions.hasnt_column(
  'public',
  'university_calendar_events',
  'source_document_id',
  'calendar events no longer reference legacy source documents'
);

select extensions.hasnt_table(
  'public',
  'course_import_runs',
  'the retired course import queue is absent'
);

select extensions.hasnt_table(
  'public',
  'academic_structure_import_runs',
  'the retired academic structure import queue is absent'
);

select extensions.hasnt_table(
  'public',
  'catalogue_section_reviews',
  'the retired section approval ledger is absent'
);

select extensions.hasnt_function(
  'public',
  'publish_course_snapshot',
  array['bigint', 'bigint', 'bigint'],
  'the retired course publication function is absent'
);

select * from extensions.finish();

rollback;
