begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;
select extensions.plan(56);

select pg_temp.publish_course('TSTS1000'::text, 2027::smallint);
select pg_temp.create_course_snapshot('TSTS1000'::text, 2028::smallint);
select pg_temp.publish_course('TSTS1000'::text, 2029::smallint);
select pg_temp.create_course_snapshot('TSTS1001'::text, 2027::smallint);
select pg_temp.publish_course('TSTS1002'::text, 2027::smallint);
update public.catalogue_records records
set archived_at = now()
from public.catalogue_codes codes, public.academic_years years
where records.code_id = codes.id and records.academic_year_id = years.id
  and codes.kind = 'course'
  and (codes.code = 'TSTS1002' or (codes.code = 'TSTS1000' and years.year = 2029));

insert into auth.users (id, email)
values ('c0000000-0000-4000-8000-000000000045', 'public-selt-test@example.test');
insert into public.selt_import_runs (id, requested_by, token_sha256)
values (
  'c1000000-0000-4000-8000-000000000045',
  'c0000000-0000-4000-8000-000000000045',
  repeat('a', 64)
);
insert into public.selt_reports (
  id, code_id, import_run_id, course_name, page_count, text_extractor,
  chart_extractor, schema_version, source_url, source_sha256, source_filename,
  source_bytes, parser_version, source_name, notes, warnings, published_at, published_by
)
select
  fixture.id, codes.id, 'c1000000-0000-4000-8000-000000000045',
  'Public SELT fixture', 1, 'fixture', 'fixture', '1',
  'https://example.test/report.pdf', repeat(fixture.hash, 64), 'internal.pdf',
  100, 'fixture', 'ANU SELT', array['Public note'], array['Internal warning'],
  fixture.published_at, 'c0000000-0000-4000-8000-000000000045'
from public.catalogue_codes codes
cross join (values
  ('TSTS1000', 'c2000000-0000-4000-8000-000000000045'::uuid, 'b', now()),
  ('TSTS1000', 'c2000000-0000-4000-8000-000000000046'::uuid, 'c', null::timestamptz),
  ('TSTS1001', 'c2000000-0000-4000-8000-000000000047'::uuid, 'd', now()),
  ('TSTS1002', 'c2000000-0000-4000-8000-000000000048'::uuid, 'e', now())
) fixture(code, id, hash, published_at)
where codes.kind = 'course' and codes.code = fixture.code;

insert into public.selt_surveys (
  report_id, year, session, label, enrolments, respondents,
  response_rate_percent, overall_learning_experience
)
select id, 2025, 'sem_1', 'Semester 1 2025', 100, 20, 20, 75
from public.selt_reports
where id in (
  'c2000000-0000-4000-8000-000000000045', 'c2000000-0000-4000-8000-000000000046',
  'c2000000-0000-4000-8000-000000000047', 'c2000000-0000-4000-8000-000000000048'
);
insert into public.selt_question_themes (report_id, key, label, introduced_year)
select id, 'overall_learning_experience', 'Overall learning experience', 2025
from public.selt_reports
where id in (
  'c2000000-0000-4000-8000-000000000045', 'c2000000-0000-4000-8000-000000000046',
  'c2000000-0000-4000-8000-000000000047', 'c2000000-0000-4000-8000-000000000048'
);

select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role anon;

select extensions.lives_ok(
  'select id, code_id, source_name, source_url, report_run_at, notes, published_at from public.selt_reports where id = ''c2000000-0000-4000-8000-000000000045''',
  'anonymous readers can query every column required by the public loader'
);
select extensions.is(
  (select source_name from public.selt_reports where id = 'c2000000-0000-4000-8000-000000000045'),
  'ANU SELT', 'anonymous readers see the published report'
);
select extensions.is(
  (select overall_learning_experience from public.selt_surveys where report_id = 'c2000000-0000-4000-8000-000000000045'),
  75, 'anonymous readers see published survey values'
);
select extensions.is(
  (select label from public.selt_question_themes where report_id = 'c2000000-0000-4000-8000-000000000045'),
  'Overall learning experience', 'anonymous readers see published question themes'
);
select extensions.is(
  (select count(id)::integer from public.selt_reports where id = 'c2000000-0000-4000-8000-000000000046'),
  0, 'anonymous readers cannot see an unpublished report'
);
select extensions.is(
  (select count(*)::integer from public.selt_surveys where report_id = 'c2000000-0000-4000-8000-000000000046'),
  0, 'anonymous readers cannot see unpublished surveys'
);
select extensions.is(
  (select count(*)::integer from public.selt_question_themes where report_id = 'c2000000-0000-4000-8000-000000000046'),
  0, 'anonymous readers cannot see unpublished question themes'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.selt_reports', 'select'),
  'anonymous readers have column grants rather than a report table grant'
);
select extensions.is(
  (select count(id)::integer from public.selt_reports where id = fixture.id),
  0, 'anonymous readers cannot see a published report for ' || fixture.description
)
from (values
  ('c2000000-0000-4000-8000-000000000047'::uuid, 'a draft-only course'),
  ('c2000000-0000-4000-8000-000000000048'::uuid, 'an archived-only course')
) fixture(id, description);
select extensions.is(
  (select count(*)::integer from public.selt_surveys where report_id = fixture.id),
  0, 'anonymous readers cannot see surveys for ' || fixture.description
)
from (values
  ('c2000000-0000-4000-8000-000000000047'::uuid, 'a draft-only course'),
  ('c2000000-0000-4000-8000-000000000048'::uuid, 'an archived-only course')
) fixture(id, description);
select extensions.is(
  (select count(*)::integer from public.selt_question_themes where report_id = fixture.id),
  0, 'anonymous readers cannot see question themes for ' || fixture.description
)
from (values
  ('c2000000-0000-4000-8000-000000000047'::uuid, 'a draft-only course'),
  ('c2000000-0000-4000-8000-000000000048'::uuid, 'an archived-only course')
) fixture(id, description);

-- Exercise each internal column, including on a report that is otherwise public.
select extensions.throws_ok(
  format('select %I from public.selt_reports where id = %L', column_name, 'c2000000-0000-4000-8000-000000000045'),
  '42501', null, 'anonymous readers cannot read report column ' || column_name
)
from (values
  ('import_run_id'), ('course_name'), ('subject_owner'), ('source_contact'),
  ('report_run_at_raw'), ('page_count'), ('text_extractor'), ('chart_extractor'),
  ('schema_version'), ('source_sha256'), ('source_filename'), ('source_bytes'),
  ('parser_version'), ('warnings'), ('published_by'), ('created_at')
) internal_columns(column_name);

select extensions.throws_ok(
  'select * from public.selt_reports', '42501', null,
  'anonymous readers cannot request all report columns'
);
select extensions.throws_ok(
  'select requested_by from public.selt_import_runs', '42501', null,
  'anonymous readers cannot read import attribution'
);
select extensions.throws_ok(
  'select token_sha256 from public.selt_import_runs', '42501', null,
  'anonymous readers cannot read import token hashes'
);

select extensions.throws_ok(statement, '42501', null, description)
from (values
  ('insert into public.selt_reports (source_name) values (''Forbidden'')', 'anonymous readers cannot insert reports'),
  ('update public.selt_reports set source_name = ''Forbidden'' where id = ''c2000000-0000-4000-8000-000000000045''', 'anonymous readers cannot update reports'),
  ('delete from public.selt_reports where id = ''c2000000-0000-4000-8000-000000000045''', 'anonymous readers cannot delete reports'),
  ('insert into public.selt_surveys (report_id, year, session, label) values (''c2000000-0000-4000-8000-000000000045'', 2025, ''sem_2'', ''Forbidden'')', 'anonymous readers cannot insert surveys'),
  ('update public.selt_surveys set label = ''Forbidden'' where report_id = ''c2000000-0000-4000-8000-000000000045''', 'anonymous readers cannot update surveys'),
  ('delete from public.selt_surveys where report_id = ''c2000000-0000-4000-8000-000000000045''', 'anonymous readers cannot delete surveys'),
  ('insert into public.selt_question_themes (report_id, key, label, introduced_year) values (''c2000000-0000-4000-8000-000000000045'', ''feedback'', ''Forbidden'', 2025)', 'anonymous readers cannot insert question themes'),
  ('update public.selt_question_themes set label = ''Forbidden'' where report_id = ''c2000000-0000-4000-8000-000000000045''', 'anonymous readers cannot update question themes'),
  ('delete from public.selt_question_themes where report_id = ''c2000000-0000-4000-8000-000000000045''', 'anonymous readers cannot delete question themes')
) mutations(statement, description);

reset role;
set local role authenticated;
select extensions.is(
  (select source_name from public.selt_reports where id = 'c2000000-0000-4000-8000-000000000045'),
  'ANU SELT', 'authenticated non-admin readers can still read the public fields'
);
select extensions.is(
  (select count(id)::integer from public.selt_reports where id = 'c2000000-0000-4000-8000-000000000046'),
  0, 'authenticated non-admin readers cannot see drafts'
);
select extensions.is(
  (select count(id)::integer from public.selt_reports where id = fixture.id),
  0, 'authenticated non-admin readers cannot see a published report for ' || fixture.description
)
from (values
  ('c2000000-0000-4000-8000-000000000047'::uuid, 'a draft-only course'),
  ('c2000000-0000-4000-8000-000000000048'::uuid, 'an archived-only course')
) fixture(id, description);
select extensions.is(
  (select count(*)::integer from public.selt_surveys where report_id = fixture.id),
  0, 'authenticated non-admin readers cannot see surveys for ' || fixture.description
)
from (values
  ('c2000000-0000-4000-8000-000000000047'::uuid, 'a draft-only course'),
  ('c2000000-0000-4000-8000-000000000048'::uuid, 'an archived-only course')
) fixture(id, description);
select extensions.is(
  (select count(*)::integer from public.selt_question_themes where report_id = fixture.id),
  0, 'authenticated non-admin readers cannot see question themes for ' || fixture.description
)
from (values
  ('c2000000-0000-4000-8000-000000000047'::uuid, 'a draft-only course'),
  ('c2000000-0000-4000-8000-000000000048'::uuid, 'an archived-only course')
) fixture(id, description);
reset role;

insert into private.user_roles (user_id, role_id, granted_by)
select 'c0000000-0000-4000-8000-000000000045', id, 'c0000000-0000-4000-8000-000000000045'
from private.app_roles where key = 'admin'
on conflict (user_id) do update set role_id = excluded.role_id;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000045","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000045', true);
set local role authenticated;
select extensions.is(
  (select count(id)::integer from public.selt_reports where id = fixture.id),
  1, 'import administrators can still review reports for ' || fixture.description
)
from (values
  ('c2000000-0000-4000-8000-000000000047'::uuid, 'a draft-only course'),
  ('c2000000-0000-4000-8000-000000000048'::uuid, 'an archived-only course')
) fixture(id, description);
select extensions.is(
  (select count(*)::integer from public.selt_surveys where report_id = fixture.id),
  1, 'import administrators can still review surveys for ' || fixture.description
)
from (values
  ('c2000000-0000-4000-8000-000000000047'::uuid, 'a draft-only course'),
  ('c2000000-0000-4000-8000-000000000048'::uuid, 'an archived-only course')
) fixture(id, description);
select extensions.is(
  (select count(*)::integer from public.selt_question_themes where report_id = fixture.id),
  1, 'import administrators can still review question themes for ' || fixture.description
)
from (values
  ('c2000000-0000-4000-8000-000000000047'::uuid, 'a draft-only course'),
  ('c2000000-0000-4000-8000-000000000048'::uuid, 'an archived-only course')
) fixture(id, description);
reset role;

select * from extensions.finish();
rollback;
