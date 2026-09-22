-- Operations data is technical and permissioned, and the inbox talks about
-- records rather than pipelines.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

insert into auth.users (
  instance_id, id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '44000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'operations-admin@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

-- Diagnostics are not public --------------------------------------------------

select extensions.ok(
  not has_table_privilege('anon', 'public.catalogue_sync_stages', 'select'),
  'anonymous readers cannot reach sync stages'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.catalogue_sync_artifacts', 'select'),
  'anonymous readers cannot reach sync artefacts'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.catalogue_extractions', 'select'),
  'anonymous readers cannot reach model responses and costs'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.catalogue_sync_artifacts', 'insert, update, delete'),
  'signed-in clients cannot forge technical evidence'
);

-- A failure tells the person who asked -----------------------------------------

insert into public.catalogue_syncs (
  id, record_id, trigger, status, requested_model, parser_version,
  prompt_version, schema_version, requested_by
) values (
  '44000000-0000-4000-8000-000000000002',
  (select id from public.catalogue_records where kind = 'course' order by id limit 1),
  'manual', 'running',
  (select id from public.import_models where enabled order by id limit 1),
  'test', 'test', 'test', '44000000-0000-4000-8000-000000000001'
);

update public.catalogue_syncs
set status = 'failed', error_message = 'OpenRouter returned 500.', completed_at = now()
where id = '44000000-0000-4000-8000-000000000002';

select extensions.is(
  (
    select count(*)::int from public.notifications
    where user_id = '44000000-0000-4000-8000-000000000001'
      and kind = 'catalogue_sync'
  ),
  1,
  'a failed sync reaches the administrator who asked for it'
);

select extensions.ok(
  (
    select title from public.notifications
    where user_id = '44000000-0000-4000-8000-000000000001'
      and kind = 'catalogue_sync'
  ) like '% sync failed',
  'the notification names the record, not the pipeline'
);

select extensions.ok(
  (
    select href from public.notifications
    where user_id = '44000000-0000-4000-8000-000000000001'
      and kind = 'catalogue_sync'
  ) like '/admin/operations/catalogue/syncs/%',
  'the failure links to the technical detail'
);

-- A check that found nothing says nothing --------------------------------------

insert into public.catalogue_syncs (
  id, record_id, trigger, status, requested_model, parser_version,
  prompt_version, schema_version, requested_by
) values (
  '44000000-0000-4000-8000-000000000003',
  (select id from public.catalogue_records where kind = 'course' order by id limit 1),
  'manual', 'running',
  (select id from public.import_models where enabled order by id limit 1),
  'test', 'test', 'test', '44000000-0000-4000-8000-000000000001'
);

update public.catalogue_syncs
set status = 'unchanged', completed_at = now()
where id = '44000000-0000-4000-8000-000000000003';

select extensions.is(
  (
    select count(*)::int from public.notifications
    where user_id = '44000000-0000-4000-8000-000000000001'
      and kind = 'catalogue_sync'
  ),
  1,
  'a sync that found nothing does not fill the inbox'
);

-- A review with nothing actionable is also quiet -------------------------------

insert into public.catalogue_syncs (
  id, record_id, trigger, status, requested_model, parser_version,
  prompt_version, schema_version, requested_by
) values (
  '44000000-0000-4000-8000-000000000004',
  (select id from public.catalogue_records where kind = 'course' order by id limit 1),
  'manual', 'running',
  (select id from public.import_models where enabled order by id limit 1),
  'test', 'test', 'test', '44000000-0000-4000-8000-000000000001'
);

update public.catalogue_syncs
set status = 'review_required', completed_at = now()
where id = '44000000-0000-4000-8000-000000000004';

select extensions.is(
  (
    select count(*)::int from public.notifications
    where user_id = '44000000-0000-4000-8000-000000000001'
      and kind = 'catalogue_sync'
  ),
  1,
  'a review with no actionable change does not notify'
);

-- A review with something to decide does notify --------------------------------

insert into public.catalogue_syncs (
  id, record_id, trigger, status, requested_model, parser_version,
  prompt_version, schema_version, requested_by
) values (
  '44000000-0000-4000-8000-000000000005',
  (select id from public.catalogue_records where kind = 'course' order by id limit 1),
  'manual', 'running',
  (select id from public.import_models where enabled order by id limit 1),
  'test', 'test', 'test', '44000000-0000-4000-8000-000000000001'
);

insert into public.catalogue_sync_changes (
  sync_id, record_id, field_path, review_unit_kind, classification,
  local_value_hash, position
) values (
  '44000000-0000-4000-8000-000000000005',
  (select record_id from public.catalogue_syncs where id = '44000000-0000-4000-8000-000000000005'),
  'course.details.description', 'scalar', 'source_change', repeat('b', 64), 0
);

update public.catalogue_syncs
set status = 'review_required', completed_at = now()
where id = '44000000-0000-4000-8000-000000000005';

select extensions.is(
  (
    select count(*)::int from public.notifications
    where user_id = '44000000-0000-4000-8000-000000000001'
      and kind = 'catalogue_sync'
  ),
  2,
  'an ANU change worth a decision reaches the inbox'
);

select extensions.ok(
  exists (
    select 1 from public.notifications
    where user_id = '44000000-0000-4000-8000-000000000001'
      and title like '% has 1 ANU change to review'
      and href like '/admin/courses/%/changes'
  ),
  'the notification counts the changes and opens the Changes tab'
);

select * from extensions.finish();

rollback;
