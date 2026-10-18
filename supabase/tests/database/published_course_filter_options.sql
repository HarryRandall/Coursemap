begin;
\ir ../helpers/catalogue-fixtures.inc
create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

select pg_temp.create_course_snapshot('ZZZA1000', 2026::smallint, 'Public filter fixture') as live_version \gset
update public.course_version_details set subject_name = 'Public subject fixture', units = 12,
  delivery_summary = 'Public delivery fixture', college = 'Public college fixture'
where version_id = :live_version;
insert into public.course_areas_of_interest(version_id, position, name) values (:live_version, 1, 'Public area fixture');
insert into public.course_tags(version_id, position, name) values (:live_version, 1, 'Public tag fixture');
select pg_temp.publish_snapshot(:live_version);

select pg_temp.create_course_snapshot('ZZZB1000', 2025::smallint, 'Private filter fixture') as private_version \gset
insert into public.course_tags(version_id, position, name) values (:private_version, 1, 'Private tag fixture');
select pg_temp.create_course_snapshot('ZZZC1000', 2025::smallint, 'Archived filter fixture') as archived_version \gset
insert into public.course_areas_of_interest(version_id, position, name) values (:archived_version, 1, 'Archived area fixture');
select pg_temp.publish_snapshot(:archived_version);
update public.catalogue_records set archived_at = now() where published_version_id = :archived_version;

select extensions.ok(
  has_function_privilege('anon', 'public.published_course_filter_options()', 'execute')
  and has_function_privilege('authenticated', 'public.published_course_filter_options()', 'execute'),
  'anonymous and authenticated readers can load published filter options'
);
set local role anon;
select extensions.ok(public.published_course_filter_options()->'subjects' @> '[{"code":"ZZZA","name":"Public subject fixture"}]', 'published subject labels are included');
select extensions.ok(public.published_course_filter_options()->'units' @> '[12]', 'published unit values are included');
select extensions.ok(public.published_course_filter_options()->'modes' @> '["Public delivery fixture"]', 'published delivery modes are included');
select extensions.ok(public.published_course_filter_options()->'colleges' @> '["Public college fixture"]', 'published colleges are included');
select extensions.ok(public.published_course_filter_options()->'tags' @> '["Public tag fixture"]', 'published tags are included');
select extensions.ok(not (public.published_course_filter_options()->'tags' @> '["Private tag fixture"]'), 'draft tags remain private');
select extensions.ok(not (public.published_course_filter_options()->'areas' @> '["Archived area fixture"]'), 'archived publications do not contribute filter options');
reset role;
select * from extensions.finish();
rollback;
