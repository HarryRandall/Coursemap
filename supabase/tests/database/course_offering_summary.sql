begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

select extensions.has_column('public', 'course_offerings', 'has_summary',
  'offering summary presence is stored independently from sessions');

create temporary table summary_fixture as
select pg_temp.create_course_snapshot('SUMM1001', 2026::smallint) as version_id;

insert into public.course_offerings (version_id, academic_year_id, has_summary)
select versions.id, versions.academic_year_id, true
from public.catalogue_versions as versions
join summary_fixture on summary_fixture.version_id = versions.id;

select extensions.is(
  (select private.course_version_projection(version_id)->'courseOffering' from summary_fixture),
  '{"deliveryMode":null,"location":null}'::jsonb,
  'an explicitly empty summary remains an object'
);

update public.course_offerings set has_summary = false
where version_id = (select version_id from summary_fixture);

select extensions.is(
  (select private.course_version_projection(version_id)->'courseOffering' from summary_fixture),
  'null'::jsonb,
  'an absent summary projects as null'
);

select extensions.throws_ok(
  $$ update public.course_offerings set delivery_mode = 'In Person'
     where version_id = (select version_id from summary_fixture) $$,
  '23514', null, 'an absent summary cannot contain a delivery mode'
);

select extensions.throws_ok(
  $$ update public.course_offerings set location = 'Acton'
     where version_id = (select version_id from summary_fixture) $$,
  '23514', null, 'an absent summary cannot contain a location'
);

update public.course_offerings set has_summary = null
where version_id = (select version_id from summary_fixture);

select extensions.is(
  (select private.course_version_projection(version_id)->'courseOffering' from summary_fixture),
  '{"deliveryMode":null,"location":null}'::jsonb,
  'historical unknown summary presence preserves the existing projection'
);

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.course_offerings'::regclass)
  and not has_table_privilege('anon', 'public.course_offerings', 'insert, update, delete')
  and not has_table_privilege('authenticated', 'public.course_offerings', 'update, delete'),
  'summary metadata retains the offering table access boundaries'
);

select pg_temp.publish_snapshot(version_id) from summary_fixture;

select extensions.throws_ok(
  $$ update public.course_offerings set has_summary = true
     where version_id = (select version_id from summary_fixture) $$,
  '55000', null, 'published offering summary presence remains immutable'
);

select * from extensions.finish();
rollback;
