begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(15);

select extensions.has_table('public', 'catalogue_syncs', 'record syncs are stored independently');
select extensions.has_table('public', 'catalogue_source_documents', 'immutable ANU source documents are stored');
select extensions.has_table('public', 'catalogue_sync_stages', 'sync stages retain technical diagnostics');
select extensions.has_table('public', 'catalogue_sync_artifacts', 'sync artefacts retain technical inputs and outputs');
select extensions.hasnt_table('public', 'catalogue_import_runs', 'catalogue import runs were removed');
select extensions.hasnt_table('public', 'catalogue_import_targets', 'catalogue import targets were removed');
select extensions.hasnt_table('public', 'catalogue_import_changes', 'legacy field review rows were removed');
select extensions.has_column('public', 'catalogue_records', 'latest_source_version_id', 'records point at the latest ANU source version');
select extensions.has_column('public', 'catalogue_records', 'source_checked_at', 'records retain the last successful source check');
select extensions.has_column('public', 'catalogue_versions', 'source_document_id', 'source versions identify their immutable source document');
select extensions.has_column('public', 'catalogue_versions', 'sync_id', 'source versions identify the sync that observed them');

select extensions.ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.catalogue_source_documents'::regclass
      and tgname = 'catalogue_source_documents_reject_mutation'
      and not tgisinternal
  ),
  'source documents reject mutation'
);

insert into public.catalogue_syncs (
  id, record_id, trigger, requested_model, parser_version, prompt_version, schema_version
) values (
  '22000000-0000-4000-8000-000000000001',
  (select id from public.catalogue_records order by id limit 1),
  'scheduled',
  (select id from public.import_models where enabled order by id limit 1),
  'test', 'test', 'test'
);

select extensions.is(
  (select trigger from public.catalogue_syncs where id = '22000000-0000-4000-8000-000000000001'),
  'scheduled',
  'scheduled syncs use the same record-level lifecycle'
);

select extensions.throws_ok(
  $$
    insert into public.catalogue_syncs (
      record_id, trigger, requested_model, parser_version, prompt_version, schema_version
    ) values (
      (select record_id from public.catalogue_syncs where id = '22000000-0000-4000-8000-000000000001'),
      'manual',
      (select id from public.import_models where enabled order by id limit 1),
      'test', 'test', 'test'
    )
  $$,
  '23505',
  null,
  'only one queued or running sync may exist for a record'
);

update public.catalogue_syncs
set status = 'cancelled', completed_at = now()
where id = '22000000-0000-4000-8000-000000000001';

select extensions.lives_ok(
  $$
    insert into public.catalogue_syncs (
      record_id, trigger, requested_model, parser_version, prompt_version, schema_version
    ) values (
      (select id from public.catalogue_records order by id limit 1),
      'manual',
      (select id from public.import_models where enabled order by id limit 1),
      'test', 'test', 'test'
    )
  $$,
  'a terminal historical sync does not block the next source check'
);

select * from extensions.finish();
rollback;
