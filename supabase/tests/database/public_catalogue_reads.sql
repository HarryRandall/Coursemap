-- The public catalogue resolves published immutable versions and nothing else.
-- A draft, a source version or an unpublished version must be unreachable
-- through the anonymous reads, whatever else exists for the record.

begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(13);

-- A record whose only content is an unpublished version ---------------------

select pg_temp.create_course_snapshot('TSTP1000'::text, 2027::smallint, 'Unpublished course'::text)
  as unpublished_course \gset

select extensions.ok(
  public.published_course_detail('TSTP1000', 2027::smallint) is null,
  'an unpublished course version is not a public course'
);

select extensions.is(
  (
    select count(*)::int from public.published_course_summaries
    where code = 'TSTP1000'
  ),
  0,
  'an unpublished course version is not in the public directory'
);

select pg_temp.publish_snapshot(:unpublished_course);

select extensions.ok(
  public.published_course_detail('TSTP1000', 2027::smallint) is not null,
  'publishing makes exactly that version public'
);

-- One projection feeds both sides. The administrator preview reaches it
-- through a permission-gated wrapper, so the wrapper is checked structurally
-- and the content is compared against the projection itself.
select extensions.is(
  public.published_course_detail('TSTP1000', 2027::smallint) -> 'snapshot',
  private.course_version_projection(:unpublished_course) -> 'snapshot',
  'the public page reads exactly the projected version'
);

select extensions.ok(
  pg_get_functiondef('public.admin_catalogue_version_projection(bigint)'::regprocedure)
    like '%course_version_projection%',
  'the administrator preview reads the same projection, not a second one'
);

-- A newer version that nobody published -------------------------------------

select pg_temp.create_course_snapshot('TSTP1000'::text, 2027::smallint, 'Newer unpublished work'::text)
  as newer_course \gset

select extensions.is(
  public.published_course_detail('TSTP1000', 2027::smallint) -> 'snapshot' ->> 'title',
  'Unpublished course',
  'a newer version does not become public by being newer'
);

update public.catalogue_records
set published_version_id = null
where id = (
  select record_id from public.catalogue_versions where id = :unpublished_course
);

select extensions.ok(
  public.published_course_detail('TSTP1000', 2027::smallint) is null,
  'unpublishing takes the course back off the public catalogue'
);

-- Structures behave the same way --------------------------------------------

select pg_temp.create_structure_snapshot('major'::text, 'TSTP-MAJ'::text, 2027::smallint, 'Test major'::text)
  as unpublished_structure \gset

select extensions.ok(
  public.published_structure_detail('TSTP-MAJ', 2027::smallint) is null,
  'an unpublished structure version is not a public structure'
);

select pg_temp.publish_snapshot(:unpublished_structure);

select extensions.ok(
  public.published_structure_detail('TSTP-MAJ', 2027::smallint) is not null,
  'publishing a structure makes that version public'
);

-- Nothing private is readable anonymously -----------------------------------

select extensions.ok(
  not has_table_privilege('anon', 'public.catalogue_drafts', 'select'),
  'anonymous readers cannot reach drafts'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.catalogue_change_events', 'select'),
  'anonymous readers cannot reach the audit trail'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.catalogue_syncs', 'select'),
  'anonymous readers cannot reach sync diagnostics'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.catalogue_source_documents', 'select'),
  'anonymous readers cannot reach ANU source material'
);

select * from extensions.finish();

rollback;
