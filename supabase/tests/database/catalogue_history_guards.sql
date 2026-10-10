-- Published catalogue history cannot be rewritten, even by the privileged
-- writer the sync worker and admin actions use.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(13);

-- An unsealed revision of COMP1110 to move rows into.
insert into public.catalogue_versions (
  record_id, kind, academic_year_id, origin, based_on_version_id, content_hash
)
select versions.record_id, versions.kind, versions.academic_year_id,
  'manual', versions.id, repeat('b', 64)
from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id = records.code_id
join public.catalogue_versions as versions on versions.id = records.published_version_id
where codes.code = 'COMP1110';

create temporary table history_fixture on commit drop as
select
  records.id as record_id,
  records.published_version_id as sealed_id,
  (
    select max(versions.id)
    from public.catalogue_versions as versions
    where versions.record_id = records.id
      and versions.sealed_at is null
  ) as open_id
from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id = records.code_id
where codes.code = 'COMP1110';

-- Rows stay with their version ------------------------------------------------

select extensions.throws_ok(
  $$
    update public.requirement_rules
    set version_id = (select open_id from history_fixture)
    where version_id = (select sealed_id from history_fixture)
  $$,
  '55000',
  null,
  'a sealed version''s requisite rules cannot be moved to another version'
);

select extensions.throws_ok(
  $$
    update public.course_offerings
    set version_id = (select open_id from history_fixture)
    where version_id = (select sealed_id from history_fixture)
  $$,
  '55000',
  null,
  'a sealed version''s offerings cannot be moved to another version'
);

select extensions.is(
  (
    select count(*)::int
    from public.requirement_rules
    where version_id = (select sealed_id from history_fixture)
  ) > 0,
  true,
  'the sealed version keeps its rules'
);

-- Publications only close -----------------------------------------------------

select extensions.throws_ok(
  $$
    update public.catalogue_publications
    set published_at = published_at - interval '1 day'
    where record_id = (select record_id from history_fixture)
  $$,
  '55000',
  null,
  'a publication time cannot be rewritten'
);

select extensions.throws_ok(
  $$
    delete from public.catalogue_publications
    where record_id = (select record_id from history_fixture)
  $$,
  '55000',
  null,
  'a publication cannot be deleted'
);

select extensions.lives_ok(
  $$
    update public.catalogue_records
    set published_version_id = null
    where id = (select record_id from history_fixture)
  $$,
  'unpublishing still closes the open publication'
);

select extensions.is(
  (
    select count(*)::int
    from public.catalogue_publications
    where record_id = (select record_id from history_fixture)
      and unpublished_at is null
  ),
  0,
  'the closed publication records when it ended'
);

select extensions.throws_ok(
  $$
    update public.catalogue_publications
    set unpublished_at = now()
    where record_id = (select record_id from history_fixture)
  $$,
  '55000',
  null,
  'a closed publication cannot be reopened or re-closed'
);

-- The change log is append-only ---------------------------------------------------

insert into public.catalogue_change_events (record_id, event_kind, origin)
select record_id, 'edit', 'manual' from history_fixture;

insert into public.catalogue_field_changes (event_id, position, field_path)
select max(id), 0, 'title' from public.catalogue_change_events;

select extensions.throws_ok(
  $$ update public.catalogue_change_events set event_kind = 'discard' $$,
  '55000',
  null,
  'a change event cannot be rewritten'
);

select extensions.throws_ok(
  $$ delete from public.catalogue_field_changes $$,
  '55000',
  null,
  'a field change cannot be deleted'
);

select extensions.throws_ok(
  $$ truncate public.catalogue_change_events cascade $$,
  '55000',
  null,
  'the change log cannot be truncated'
);

select extensions.ok(
  not has_table_privilege('service_role', 'public.catalogue_versions', 'truncate')
    and not has_table_privilege('authenticated', 'public.plans', 'truncate'),
  'API roles cannot truncate tables'
);

-- Selected structures block archival ---------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '43000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'history-student@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.plans (
  id, owner_id, academic_year_id, name, is_primary, commencement_year, study_load
)
values (
  '43000000-0000-4000-8000-0000000000a1',
  '43000000-0000-4000-8000-000000000001',
  (select id from public.academic_years where year = 2026),
  'History plan', true, 2026, 'full_time'
);

insert into public.plan_structures (plan_id, owner_id, role, catalogue_record_id)
select '43000000-0000-4000-8000-0000000000a1',
  '43000000-0000-4000-8000-000000000001', 'programme', records.id
from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id = records.code_id
where codes.code = 'BCOMP';

select extensions.throws_ok(
  $$
    update public.catalogue_records
    set archived_at = now()
    where code_id = (select id from public.catalogue_codes where code = 'BCOMP')
  $$,
  '55000',
  null,
  'a programme year a plan selects cannot be archived'
);

select * from extensions.finish();

rollback;
