-- Separate reading catalogue drafts from writing catalogue content.
--
-- private.can_manage_catalogue() gated every catalogue write policy, but it
-- returned true for anyone holding courses.read_drafts or catalogue.read_drafts,
-- and the default `user` role granted to every sign-up holds both. Combined with
-- insert and update grants to `authenticated`, any signed-in account could create
-- catalogue items, seal snapshots and move published_version_id -- publishing
-- arbitrary content to the anonymous catalogue and bypassing the publication gate
-- in publish_catalogue_version() entirely.
--
-- Reading drafts and writing content are now separate helpers. No application
-- code depends on the revoked grants: every mutation runs through a SECURITY
-- DEFINER routine or the direct Postgres connection in lib/catalogue-import.

-- Writing requires an administrative permission. `catalogue.read` was never a
-- real permission key (the key is catalogue.read_drafts), so it is dropped.
create or replace function private.can_write_catalogue()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_permission('catalogue.write')
    or private.has_permission('imports.manage');
$function$;

-- Reading unpublished drafts keeps the wider permission set the read policies
-- were written against.
create or replace function private.can_read_catalogue_drafts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_permission('catalogue.read_drafts')
    or private.has_permission('courses.read_drafts')
    or private.has_permission('catalogue.write')
    or private.has_permission('courses.write')
    or private.has_permission('imports.manage');
$function$;

revoke all on function private.can_write_catalogue() from public;
revoke all on function private.can_read_catalogue_drafts() from public;
grant execute on function private.can_write_catalogue() to authenticated;
grant execute on function private.can_read_catalogue_drafts() to anon, authenticated;

-- Read helpers follow the draft-reading side.
create or replace function private.can_read_version(p_version_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_published_version(p_version_id)
    or private.can_read_catalogue_drafts()
    or exists (
      select 1
      from public.course_attempts as attempts
      where attempts.catalogue_version_id = p_version_id
        and attempts.owner_id = (select auth.uid())
    );
$function$;

create or replace function private.can_read_catalogue_item(p_item_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_read_catalogue_drafts()
    or exists (
      select 1
      from public.catalogue_records as item_years
      where item_years.code_id = p_item_id
        and item_years.published_version_id is not null
        and item_years.archived_at is null
    )
    or exists (
      select 1
      from public.requirement_conditions as conditions
      where conditions.code_id = p_item_id
        and private.is_published_version(conditions.version_id)
    )
    or exists (
      select 1
      from public.requirement_condition_options as options
      where options.code_id = p_item_id
        and private.is_published_version(options.version_id)
    )
    or exists (
      select 1
      from public.requirement_item_references as item_references
      where item_references.code_id = p_item_id
        and private.is_published_version(item_references.version_id)
    )
    or exists (
      select 1
      from public.course_related_courses as related
      where related.related_course_id = p_item_id
        and private.is_published_version(related.version_id)
    )
    or exists (
      select 1
      from public.course_attempts as attempts
      join public.catalogue_versions as versions
        on versions.id = attempts.catalogue_version_id
      join public.catalogue_records as records on records.id = versions.record_id
      where records.code_id = p_item_id
        and attempts.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.plan_items
      join public.catalogue_records as records
        on records.id = plan_items.catalogue_record_id
      where records.code_id = p_item_id
        and plan_items.owner_id = (select auth.uid())
    );
$function$;

-- The admin preview projection is a read, so it follows the draft-reading side.
create or replace function public.admin_catalogue_version_projection(p_version_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  snapshot_kind text;
begin
  if not private.can_read_catalogue_drafts() then
    raise exception using errcode = '42501', message = 'Catalogue permission is required.';
  end if;
  select kind into snapshot_kind from public.catalogue_versions where id = p_version_id;
  if snapshot_kind is null then
    raise exception using errcode = 'P0002', message = 'The snapshot does not exist.';
  end if;
  if snapshot_kind <> 'course' then
    return null;
  end if;
  return private.course_version_projection(p_version_id)
    || jsonb_build_object('snapshotId', p_version_id);
end;
$function$;

-- Identity and year write policies.
drop policy catalogue_codes_admin_write on public.catalogue_codes;
create policy catalogue_codes_admin_write
on public.catalogue_codes
for all
to authenticated
using ((select private.can_write_catalogue()))
with check ((select private.can_write_catalogue()));

drop policy catalogue_records_admin_write on public.catalogue_records;
create policy catalogue_records_admin_write
on public.catalogue_records
for all
to authenticated
using ((select private.can_write_catalogue()))
with check ((select private.can_write_catalogue()));

-- Read policies that named the old helper directly.
drop policy catalogue_records_read on public.catalogue_records;
create policy catalogue_records_read
on public.catalogue_records
for select
to anon, authenticated
using (
  (published_version_id is not null and archived_at is null)
  or (select private.can_read_catalogue_drafts())
  or (select private.can_read_catalogue_item(code_id))
);

drop policy catalogue_publications_read on public.catalogue_publications;
create policy catalogue_publications_read
on public.catalogue_publications
for select
to anon, authenticated
using (
  (version_id is not null and (select private.is_published_version(version_id)))
  or (select private.can_read_catalogue_drafts())
);

-- Snapshot and child insert policies.
do $$
declare
  child text;
begin
  foreach child in array array[
    'catalogue_versions',
    'course_version_details',
    'structure_version_details',
    'catalogue_version_provenance',
    'course_offerings',
    'offering_sessions',
    'course_learning_outcomes',
    'course_assessment_items',
    'course_assessment_outcomes',
    'course_fees',
    'course_attributes',
    'course_unit_options',
    'course_areas_of_interest',
    'course_related_courses',
    'academic_structure_snapshot_sections',
    'academic_structure_learning_outcomes',
    'academic_structure_fees',
    'academic_structure_snapshot_relationships',
    'requirement_rules',
    'requirement_groups',
    'requirement_conditions',
    'requirement_condition_options',
    'requirement_item_references'
  ] loop
    execute format('drop policy %I on public.%I', child || '_admin_insert', child);
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      'with check ((select private.can_write_catalogue()))',
      child || '_admin_insert',
      child
    );
  end loop;
end;
$$;

-- Nothing in the application writes these tables through PostgREST.
revoke insert, update on table
  public.catalogue_codes,
  public.catalogue_records
from authenticated;

revoke insert on table
  public.catalogue_versions,
  public.course_version_details,
  public.structure_version_details,
  public.catalogue_version_provenance,
  public.requirement_rules,
  public.requirement_groups,
  public.requirement_conditions,
  public.requirement_condition_options,
  public.requirement_item_references
from authenticated;

drop function private.can_manage_catalogue();
