begin;
\ir ../helpers/catalogue-fixtures.inc
create extension if not exists pgtap with schema extensions;
select extensions.plan(21);

create temporary table td_evidence_fixtures (code text, year smallint, version_id bigint);
insert into td_evidence_fixtures values
  ('TDEV1000', 2026, pg_temp.create_course_snapshot('TDEV1000', 2026::smallint)),
  ('TDEV1000', 2025, pg_temp.create_course_snapshot('TDEV1000', 2025::smallint)),
  ('TDEV1001', 2026, pg_temp.create_course_snapshot('TDEV1001', 2026::smallint)),
  ('TDEV1002', 2026, pg_temp.create_course_snapshot('TDEV1002', 2026::smallint)),
  ('TDEV1003', 2026, pg_temp.create_course_snapshot('TDEV1003', 2026::smallint)),
  ('TDEV1004', 2026, pg_temp.create_course_snapshot('TDEV1004', 2026::smallint)),
  ('TDEV1005', 2026, pg_temp.create_course_snapshot('TDEV1005', 2026::smallint)),
  ('TDEV1006', 2026, pg_temp.create_course_snapshot('TDEV1006', 2026::smallint));
insert into public.course_tags(version_id, position, name)
select version_id, 1, case when year = 2025 then 'Transdisciplinary Problem-Solving' else 'Transdisciplinary' end
from td_evidence_fixtures;

create temporary table td_source_fact as
select jsonb_build_object('repair', 'Canonical ANU transdisciplinary designation',
  'sourceHash', repeat('a', 64), 'planHash', repeat('b', 64), 'retrievedAt', '2026-10-20T10:00:00Z',
  'privateNote', 'DO_NOT_LEAK_PRIVATE_NOTE', 'sourceExcerpt', jsonb_build_object(
    'code', 'TDEV1000', 'year', 2026, 'designation', 'Transdisciplinary Problem-Solving',
    'privatePath', '/private/DO_NOT_LEAK_SOURCE_PATH')::text) as fact,
  'https://programsandcourses.anu.edu.au/data/CourseSearch/GetCourses?SelectedYear=2026&GraduateAttributes%5B2%5D=Transdisciplinary+Problem-Solving'::text as locator;

insert into public.catalogue_version_provenance(version_id, academic_year_id, field_path, method, confidence, source_locator, source_excerpt)
select fixture.version_id, (select academic_year_id from public.catalogue_versions where id = fixture.version_id), 'course.tags', 'deterministic', 1, source.locator, source.fact::text
from td_evidence_fixtures as fixture cross join td_source_fact as source
where fixture.code = 'TDEV1000' and fixture.year = 2026;
insert into public.catalogue_version_provenance(version_id, academic_year_id, field_path, method, confidence, source_locator, source_excerpt)
select fixture.version_id, (select academic_year_id from public.catalogue_versions where id = fixture.version_id), 'course.tags', 'deterministic', 1, source.locator,
  jsonb_build_object('repair', 'Canonical ANU transdisciplinary tag on a separately guarded legacy version',
    'code', 'TDEV1000', 'year', 2026, 'sourceHash', repeat('a',64), 'planHash', repeat('b',64),
    'retrievedAt', '2026-10-20T10:00:00Z', 'exactStoredLegacyHash', repeat('c',64),
    'exactReconstructedBeforeHash', repeat('d',64), 'sourceProposalHash', repeat('e',64),
    'fullRawSnapshotSha256', repeat('f',64), 'privatePolicy', 'DO_NOT_LEAK_LEGACY_POLICY')::text
from td_evidence_fixtures as fixture cross join td_source_fact as source
where fixture.code = 'TDEV1000' and fixture.year = 2026;
insert into public.catalogue_version_provenance(version_id, academic_year_id, field_path, method, confidence, source_locator, source_excerpt)
select fixture.version_id, (select academic_year_id from public.catalogue_versions where id = fixture.version_id), bad.field_path, bad.method, bad.confidence, bad.locator, bad.excerpt
from td_evidence_fixtures as fixture cross join td_source_fact as source cross join lateral (values
  ('course.tags', 'deterministic', 1, replace(source.locator, 'programsandcourses.anu.edu.au', 'DO_NOT_LEAK_OTHER_HOST.example'), source.fact::text),
  ('course.tags', 'deterministic', 1, source.locator || '&token=DO_NOT_LEAK_QUERY_TOKEN', source.fact::text),
  ('course.tags', 'deterministic', 1, source.locator, 'DO_NOT_LEAK_MALFORMED_JSON'),
  ('course.tags', 'deterministic', 1, source.locator, (source.fact || '{"sourceExcerpt":"not JSON"}'::jsonb)::text),
  ('course.tags', 'deterministic', 1, source.locator, (source.fact || '{"sourceExcerpt":{"code":"WRNG1000","year":2026,"designation":"Transdisciplinary Problem-Solving"}}'::jsonb)::text),
  ('course.tags', 'deterministic', 1, source.locator || '&%53electedYear=2025', source.fact::text),
  ('course.tags', 'model', 1, source.locator, source.fact::text),
  ('course.tags', 'deterministic', 0.5, source.locator, source.fact::text),
  ('private.field', 'deterministic', 1, source.locator, 'DO_NOT_LEAK_UNRELATED_FIELD')
) as bad(field_path, method, confidence, locator, excerpt)
where fixture.code = 'TDEV1000' and fixture.year = 2026;

-- The final source-bound fact wins ties with obsolete facts in the same import.
insert into public.catalogue_version_provenance(version_id, academic_year_id, field_path, method, confidence, source_locator, source_excerpt)
select fixture.version_id, (select academic_year_id from public.catalogue_versions where id = fixture.version_id), 'course.tags', 'deterministic', 1, source.locator, source.fact::text
from td_evidence_fixtures as fixture cross join td_source_fact as source
where fixture.code = 'TDEV1000' and fixture.year = 2026;

insert into public.catalogue_version_provenance(version_id, academic_year_id, field_path, method, confidence, source_locator, source_excerpt, created_at)
select fixture.version_id, (select academic_year_id from public.catalogue_versions where id = fixture.version_id), 'course.tags', 'deterministic', 1, source.locator,
  (source.fact || jsonb_build_object('sourceExcerpt', jsonb_build_object('code', fixture.code, 'year', 2026, 'designation', 'Transdisciplinary Problem-Solving')::text))::text,
  '2026-01-01T00:00:00Z'::timestamptz
from td_evidence_fixtures as fixture cross join td_source_fact as source where fixture.code in ('TDEV1004','TDEV1005','TDEV1006');
insert into public.catalogue_version_provenance(version_id, academic_year_id, field_path, method, confidence, source_locator, source_excerpt, created_at)
select fixture.version_id, (select academic_year_id from public.catalogue_versions where id = fixture.version_id),
  case when fixture.code = 'TDEV1006' then 'requirements' else 'course.tags' end,
  case when fixture.code = 'TDEV1005' then 'manual' else 'deterministic' end, 1, source.locator,
  (source.fact || jsonb_build_object('sourceExcerpt', jsonb_build_object('code', fixture.code, 'year', 2025, 'designation', 'Transdisciplinary Problem-Solving')::text))::text,
  '2026-01-02T00:00:00Z'::timestamptz
from td_evidence_fixtures as fixture cross join td_source_fact as source where fixture.code in ('TDEV1004','TDEV1005','TDEV1006');

select pg_temp.publish_snapshot(version_id) from td_evidence_fixtures where code <> 'TDEV1001';
update public.catalogue_records set archived_at = statement_timestamp()
where published_version_id = (select version_id from td_evidence_fixtures where code = 'TDEV1002');
-- An earlier published alias cannot supply provenance to a newer empty head.
select pg_temp.publish_course('TDEV1003', 2026::smallint);

select extensions.ok(has_function_privilege('anon', 'public.published_course_td_designation_evidence(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.published_course_td_designation_evidence(jsonb)', 'execute'), 'public RPC grants are explicit');
select extensions.ok(not has_function_privilege('anon', 'private.sanitised_td_designation_evidence(text,smallint,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'private.sanitised_td_designation_evidence(text,smallint,text,text)', 'execute'), 'raw sanitiser remains private');
select extensions.ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.published_course_td_designation_evidence(jsonb)'::regprocedure), 'public security definer has empty search path');
select extensions.is((select count(*)::int from public.published_course_td_designation_evidence('[{"code":" tdev1000 ","year":2026},{"code":"TDEV1000","year":2026},{"code":"TDEV1000","year":2025}]')), 2, 'normalised exact selections deduplicate');
select extensions.is((select count(*)::int from (values ('null'::jsonb), ('{}'::jsonb), ('[null,{},"TDEV1000",{"code":"TDEV1000","year":"2026"},{"code":"TDEV1000","year":2026.5}]'::jsonb)) as invalid(value)
  cross join lateral public.published_course_td_designation_evidence(invalid.value)), 0, 'invalid input is empty and does not cast unsafe values');
select extensions.is((select count(*)::int from public.published_course_td_designation_evidence((select jsonb_agg(jsonb_build_object('code','TDEV1000','year',2026)) from generate_series(1,201)))), 0, 'oversized input is rejected before deduplication');
select extensions.is_empty($$select * from public.published_course_td_designation_evidence('[{"code":"TDEV1000","year":2024}]')$$, 'no nearest-year fallback');
select extensions.is_empty($$select * from public.published_course_td_designation_evidence('[{"code":"TDEV1001","year":2026}]')$$, 'draft-only records are absent');
select extensions.is_empty($$select * from public.published_course_td_designation_evidence('[{"code":"TDEV1002","year":2026}]')$$, 'archived records are absent');
select extensions.is((select jsonb_array_length(provenance) from public.published_course_td_designation_evidence('[{"code":"TDEV1003","year":2026}]')), 0, 'unrelated current heads cannot borrow older evidence');
select extensions.is((select jsonb_array_length(provenance) from public.published_course_td_designation_evidence('[{"code":"TDEV1000","year":2026}]')), 1, 'only the latest relevant source-bound tag fact is public');
select extensions.ok((select to_jsonb(result)::text not like '%DO_NOT_LEAK%' from public.published_course_td_designation_evidence('[{"code":"TDEV1000","year":2026}]') as result), 'private extra notes, paths, operational fields and malformed facts never leak');
select extensions.ok((select bool_and(value->>'source_locator' = 'https://programsandcourses.anu.edu.au/data/CourseSearch/GetCourses?SelectedYear=2026&GraduateAttributes%5B2%5D=Transdisciplinary+Problem-Solving') from public.published_course_td_designation_evidence('[{"code":"TDEV1000","year":2026}]'), lateral jsonb_array_elements(provenance)), 'locator is reconstructed from public whitelist fields');
select extensions.ok((select bool_and(private.sanitised_td_designation_evidence('TDEV1000',2026::smallint,locator,invalid.excerpt) is null) from td_source_fact cross join (values
  ('{"bad":"\u0000"}'), ('{"bad":1e999999999}'), ('{'), ('[]'), ('null')) as invalid(excerpt)), 'malformed and unsupported JSON encodings do not throw or leak');
select extensions.is((select cardinality(tags) from public.published_course_td_designation_evidence('[{"code":"TDEV1000","year":2025}]')), 1, 'native published tags remain available without repair evidence');

set local role anon;
select extensions.is((select count(*)::int from public.published_course_td_designation_evidence('[{"code":"TDEV1000","year":2026}]')), 1, 'anonymous users can read only the bounded public oracle');
select extensions.ok((select to_jsonb(result)::text not like '%DO_NOT_LEAK%' from public.published_course_td_designation_evidence('[{"code":"TDEV1000","year":2026}]') as result), 'anonymous output contains no raw private provenance');
reset role;
set local role authenticated;
select extensions.is((select count(*)::int from public.published_course_td_designation_evidence('[{"code":"TDEV1000","year":2026}]')), 1, 'authenticated callers use the same publication boundary');
reset role;
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.catalogue_version_provenance'::regclass), 'general provenance RLS remains enabled');
select extensions.is((select sum(jsonb_array_length(provenance))::int from public.published_course_td_designation_evidence('[{"code":"TDEV1004","year":2026},{"code":"TDEV1005","year":2026}]')), 0, 'a newer wrong-year or manual tag fact blocks older positive authority');
select extensions.is((select jsonb_array_length(provenance) from public.published_course_td_designation_evidence('[{"code":"TDEV1006","year":2026}]')), 1, 'newer unrelated requirement evidence does not supersede tag authority');

select * from extensions.finish();
rollback;
