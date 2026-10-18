begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;
select extensions.plan(5);

select pg_temp.create_structure_snapshot('major', 'FAST-MAJ', 2027::smallint, 'Published major') as published_version \gset
select pg_temp.publish_snapshot(:published_version);
select pg_temp.create_structure_snapshot('major', 'PRIVATE-MAJ', 2027::smallint, 'Unpublished major') as draft_version \gset

select pg_temp.create_structure_snapshot('major', 'ARCHIVED-MAJ', 2027::smallint, 'Archived major') as archived_version \gset
select pg_temp.publish_snapshot(:archived_version);
update public.catalogue_records set archived_at = now()
where published_version_id = :archived_version;

select extensions.ok(
  private.can_read_catalogue_item((select id from public.catalogue_codes where code = 'FAST-MAJ')),
  'a published code is public'
);
select extensions.ok(
  not private.can_read_catalogue_item((select id from public.catalogue_codes where code = 'PRIVATE-MAJ')),
  'an unreferenced unpublished code stays private'
);

select extensions.ok(
  not private.can_read_catalogue_item((select id from public.catalogue_codes where code = 'ARCHIVED-MAJ')),
  'archiving the only publication removes public code access'
);

-- A public read must finish before reaching the expensive fallback. Raising
-- here catches a regression without depending on machine speed or row counts.
create or replace function private.can_read_catalogue_drafts() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  raise exception 'Editorial fallback reached.';
end;
$$;

set local role anon;
select extensions.results_eq(
  $$select code from public.catalogue_codes where code = 'FAST-MAJ'$$,
  $$values ('FAST-MAJ'::text)$$,
  'anonymous published reads skip editorial and private-plan checks'
);
reset role;
select extensions.throws_ok(
  $$select private.can_read_catalogue_item((select id from public.catalogue_codes where code = 'PRIVATE-MAJ'))$$,
  'P0001', 'Editorial fallback reached.',
  'unpublished codes still use the existing permission fallback'
);

select * from extensions.finish();
rollback;
