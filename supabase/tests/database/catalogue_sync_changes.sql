-- ANU changes waiting for a decision are not audit rows, and no end-user role
-- may write or forge them. Resolution runs through the catalogue draft service
-- under the same catalogue.write gate as every other draft mutation.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

select extensions.has_table('public', 'catalogue_sync_changes', 'ANU review rows are stored');

select extensions.ok(
  (
    select relrowsecurity from pg_class
    where oid = 'public.catalogue_sync_changes'::regclass
  ),
  'row level security is enabled on ANU review rows'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.catalogue_sync_changes', 'insert, update, delete'),
  'authenticated clients cannot write or resolve ANU review rows directly'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.catalogue_sync_changes', 'select'),
  'anonymous readers cannot see ANU review rows'
);

insert into public.catalogue_syncs (
  id, record_id, trigger, status, requested_model, parser_version,
  prompt_version, schema_version
) values (
  '33000000-0000-4000-8000-000000000001',
  (select id from public.catalogue_records order by id limit 1),
  'manual', 'review_required',
  (select id from public.import_models where enabled order by id limit 1),
  'test', 'test', 'test'
);

insert into public.catalogue_sync_changes (
  sync_id, record_id, field_path, review_unit_kind, classification,
  base_source_value, local_value, incoming_source_value, local_value_hash, position
) values (
  '33000000-0000-4000-8000-000000000001',
  (select record_id from public.catalogue_syncs where id = '33000000-0000-4000-8000-000000000001'),
  'course.details.description', 'scalar', 'conflict',
  '"Previous ANU"'::jsonb, '"Local"'::jsonb, '"New ANU"'::jsonb,
  repeat('a', 64), 0
);

select extensions.throws_ok(
  $$
    update public.catalogue_sync_changes
    set classification = 'made_up'
    where sync_id = '33000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'a review row carries a domain classification, not an arbitrary label'
);

select extensions.throws_ok(
  $$
    update public.catalogue_sync_changes
    set decision = 'use_source'
    where sync_id = '33000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'a decision without a resolution time is rejected'
);

select extensions.lives_ok(
  $$
    update public.catalogue_sync_changes
    set decision = 'keep_local', resolved_at = now()
    where sync_id = '33000000-0000-4000-8000-000000000001'
  $$,
  'a resolved decision records when it was taken'
);

select extensions.throws_ok(
  $$
    insert into public.catalogue_sync_changes (
      sync_id, record_id, field_path, review_unit_kind, classification,
      local_value_hash, position
    ) values (
      '33000000-0000-4000-8000-000000000001',
      (select record_id from public.catalogue_syncs where id = '33000000-0000-4000-8000-000000000001'),
      'course.details.description', 'scalar', 'source_change', repeat('a', 64), 1
    )
  $$,
  '23505',
  null,
  'one sync holds at most one review row per field'
);

select extensions.lives_ok(
  $$
    insert into public.catalogue_change_events (
      record_id, event_kind, origin, sync_change_id
    )
    select changes.record_id, 'source_accepted', 'source', changes.id
    from public.catalogue_sync_changes as changes
    where changes.sync_id = '33000000-0000-4000-8000-000000000001'
  $$,
  'accepting an ANU value is an auditable event that names the row it answered'
);

select extensions.throws_ok(
  $$
    insert into public.catalogue_change_events (
      record_id, event_kind, origin, sync_change_id
    )
    select changes.record_id, 'edit', 'manual', changes.id
    from public.catalogue_sync_changes as changes
    where changes.sync_id = '33000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'only a source decision may name a review row'
);

select extensions.is(
  (
    select count(*)::int from public.catalogue_change_events
    where event_kind = 'source_accepted' and sync_change_id is not null
  ),
  1,
  'the changelog can join a decision to the field it decided'
);

select * from extensions.finish();

rollback;
