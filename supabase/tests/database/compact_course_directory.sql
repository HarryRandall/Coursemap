begin;
\ir ../helpers/catalogue-fixtures.inc
create extension if not exists pgtap with schema extensions;
select extensions.plan(14);
select pg_temp.create_course_snapshot('ZZZA1000', 2026::smallint, 'Preferred edition') as live_version \gset
insert into public.course_tags(version_id,position,name) values (:live_version,1,'Directory public tag');
insert into public.course_offerings(version_id,academic_year_id)
select :live_version,academic_year_id from public.catalogue_versions where id=:live_version returning id as offering_id \gset
insert into public.offering_sessions(version_id,academic_year_id,course_offering_id,academic_period_code,academic_period_name,position,source_text)
select :live_version,academic_year_id,:offering_id,'S1','First Semester',1,'First Semester' from public.catalogue_versions where id=:live_version;
select pg_temp.publish_snapshot(:live_version);
select pg_temp.create_course_snapshot('ZZZA1000', 2027::smallint, 'Newer edition') as newer_version \gset
insert into public.course_areas_of_interest(version_id,position,name) values (:newer_version,1,'Directory area');
select pg_temp.publish_snapshot(:newer_version);
select pg_temp.create_course_snapshot('ZZZB1000', 2026::smallint, 'Private edition') as private_version \gset
insert into public.course_tags(version_id,position,name) values (:private_version,1,'Directory private tag');
select pg_temp.create_course_snapshot('ZZZC1000', 2026::smallint, 'Archived edition') as archived_version \gset
select pg_temp.publish_snapshot(:archived_version);
update public.catalogue_records set archived_at = now() where published_version_id = :archived_version;
select pg_temp.create_course_snapshot('ZZZD1000', 2024::smallint, 'Older fallback') as fallback_old \gset
select pg_temp.publish_snapshot(:fallback_old);
select pg_temp.create_course_snapshot('ZZZD1000', 2027::smallint, 'Latest fallback') as fallback_new \gset
select pg_temp.publish_snapshot(:fallback_new);
set local role anon;
select extensions.ok(public.published_course_directory_page()->0 is not null, 'anonymous readers can load the directory');
select extensions.is((select value->>'title' from jsonb_array_elements(public.published_course_directory_page()) where value->>'code' = 'ZZZA1000'), 'Preferred edition', 'unfiltered directory prefers 2026 before pagination');
select extensions.is((select value->>'title' from jsonb_array_elements(public.published_course_directory_page(2027)) where value->>'code' = 'ZZZA1000'), 'Newer edition', 'explicit year selects its own edition');
select extensions.is((select count(*) from jsonb_array_elements(public.published_course_directory_page()) where value->>'code' in ('ZZZB1000','ZZZC1000')), 0::bigint, 'draft and archived records are absent');
select extensions.is(jsonb_array_length(public.published_course_directory_page(null,0,1)), 1, 'page limit is applied in the database');
select extensions.is(public.published_course_directory_page(1900), '[]'::jsonb, 'unknown years are empty');
select extensions.is(public.published_course_filter_versions(2026,'tag','directory PUBLIC tag'), jsonb_build_array(:live_version::bigint), 'tag filtering is case insensitive and published only');
select extensions.is(public.published_course_filter_versions(2026,'tag','Directory private tag'), '[]'::jsonb, 'draft tag matches are absent');
select extensions.is(public.published_course_filter_versions(2027,'area','Directory area'), jsonb_build_array(:newer_version::bigint), 'area matches retain the selected year');
select extensions.is(public.published_course_filter_versions(2026,'unsupported','Directory public tag'), '[]'::jsonb, 'unknown filter kinds do not broaden results');
select extensions.is((select value->>'title' from jsonb_array_elements(public.published_course_directory_page()) where value->>'code' = 'ZZZD1000'), 'Latest fallback', 'without 2026 the latest published year wins');
select extensions.ok(public.published_course_filter_versions(2026,'session_code','S1') @> jsonb_build_array(:live_version::bigint), 'session code filters keep their exact semantics');
select extensions.ok(public.published_course_filter_versions(2026,'session_name','First Semester') @> jsonb_build_array(:live_version::bigint), 'candidate sessions accept display names');
select extensions.is(public.published_course_filter_versions(2026,'session_name','S1'), '[]'::jsonb, 'a code does not match a session display name');
reset role;
select * from extensions.finish();
rollback;
