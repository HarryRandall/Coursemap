-- Course tags are catalogue content: public wherever the version they belong
-- to is readable, written only by the sync or an administrator's publication,
-- sealed with that version, and one category however they are capitalised.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

select extensions.has_table('public', 'course_tags', 'course tags are stored');

select extensions.ok(
  (
    select relrowsecurity from pg_class
    where oid = 'public.course_tags'::regclass
  ),
  'row level security is enabled on course tags'
);

select extensions.ok(
  not has_table_privilege(
    'authenticated', 'public.course_tags', 'insert, update, delete'
  ),
  'authenticated clients cannot write course tags directly'
);

select extensions.ok(
  has_table_privilege('anon', 'public.course_tags', 'select'),
  'anonymous readers may read tags on versions their policy allows'
);

select extensions.is(
  (
    select array_agg(policyname::text order by policyname)
    from pg_policies
    where schemaname = 'public' and tablename = 'course_tags'
  ),
  array['course_tags_admin_insert', 'course_tags_read'],
  'tags carry the same policies as areas of interest'
);

select extensions.ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.course_tags'::regclass
      and tgname = 'course_tags_guard_sealed'
  ),
  'tags are sealed with their version'
);

select extensions.ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'course_tags_snapshot_name_unique'
      and indexdef ilike '%lower(name)%'
  ),
  'a version holds each tag once, however it is capitalised'
);

select extensions.ok(
  pg_get_functiondef('private.course_version_projection(bigint)'::regprocedure)
    ilike '%''tags''%public.course_tags%',
  'the course projection carries its tags'
);

select * from extensions.finish();

rollback;
