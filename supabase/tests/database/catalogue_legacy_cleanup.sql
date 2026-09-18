begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

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

select extensions.hasnt_table(
  'public',
  'catalogue_import_runs',
  'the legacy generic import run table is absent'
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

select extensions.ok(
  not has_sequence_privilege(
    'authenticated',
    'public.academic_structure_import_runs_run_number_seq',
    'usage'
  )
  and not has_sequence_privilege(
    'authenticated',
    'public.academic_structure_import_runs_run_number_seq',
    'select'
  )
  and not has_sequence_privilege(
    'authenticated',
    'public.course_import_runs_run_number_seq',
    'usage'
  )
  and not has_sequence_privilege(
    'authenticated',
    'public.course_import_runs_run_number_seq',
    'select'
  ),
  'authenticated clients cannot allocate or inspect importer run sequences directly'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'public.review_academic_structure_import_target(uuid,text,text)'::regprocedure
  ) like '%severity <> ''error''%',
  'acceptance resolves non-blocking review observations while preserving errors'
);

select * from extensions.finish();

rollback;
