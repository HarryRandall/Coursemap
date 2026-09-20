-- Separate reading catalogue drafts from writing catalogue content.
--
-- private.can_manage_catalogue() gated every catalogue write policy, but it
-- returned true for anyone holding courses.read_drafts or catalogue.read_drafts,
-- and the default `user` role granted to every sign-up holds both. Combined with
-- insert and update grants to `authenticated`, any signed-in account could create
-- catalogue items, seal snapshots and move published_snapshot_id -- publishing
-- arbitrary content to the anonymous catalogue and bypassing the publication gate
-- in publish_catalogue_snapshot() entirely.
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
create or replace function private.can_read_snapshot(p_snapshot_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_published_snapshot(p_snapshot_id)
    or private.can_read_catalogue_drafts()
    or exists (
      select 1
      from public.course_attempts as attempts
      where attempts.course_snapshot_id = p_snapshot_id
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
      from public.catalogue_item_years as item_years
      where item_years.item_id = p_item_id
        and item_years.published_snapshot_id is not null
        and item_years.archived_at is null
    )
    or exists (
      select 1
      from public.requirement_conditions as conditions
      where conditions.item_id = p_item_id
        and private.is_published_snapshot(conditions.snapshot_id)
    )
    or exists (
      select 1
      from public.requirement_condition_options as options
      where options.item_id = p_item_id
        and private.is_published_snapshot(options.snapshot_id)
    )
    or exists (
      select 1
      from public.requirement_item_references as item_references
      where item_references.item_id = p_item_id
        and private.is_published_snapshot(item_references.snapshot_id)
    )
    or exists (
      select 1
      from public.course_related_courses as related
      where related.related_course_id = p_item_id
        and private.is_published_snapshot(related.snapshot_id)
    )
    or exists (
      select 1
      from public.course_attempts as attempts
      where attempts.course_id = p_item_id
        and attempts.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.plan_items
      where plan_items.course_id = p_item_id
        and plan_items.owner_id = (select auth.uid())
    );
$function$;

-- The admin preview projection is a read, so it follows the draft-reading side.
create or replace function public.admin_snapshot_projection(p_snapshot_id bigint)
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
  select kind into snapshot_kind from public.catalogue_snapshots where id = p_snapshot_id;
  if snapshot_kind is null then
    raise exception using errcode = 'P0002', message = 'The snapshot does not exist.';
  end if;
  if snapshot_kind <> 'course' then
    return null;
  end if;
  return private.course_snapshot_projection(p_snapshot_id)
    || jsonb_build_object('snapshotId', p_snapshot_id);
end;
$function$;

-- Identity and year write policies.
drop policy catalogue_items_admin_write on public.catalogue_items;
create policy catalogue_items_admin_write
on public.catalogue_items
for all
to authenticated
using ((select private.can_write_catalogue()))
with check ((select private.can_write_catalogue()));

drop policy catalogue_item_years_admin_write on public.catalogue_item_years;
create policy catalogue_item_years_admin_write
on public.catalogue_item_years
for all
to authenticated
using ((select private.can_write_catalogue()))
with check ((select private.can_write_catalogue()));

-- Read policies that named the old helper directly.
drop policy catalogue_item_years_read on public.catalogue_item_years;
create policy catalogue_item_years_read
on public.catalogue_item_years
for select
to anon, authenticated
using (
  (published_snapshot_id is not null and archived_at is null)
  or (select private.can_read_catalogue_drafts())
  or (select private.can_read_catalogue_item(item_id))
);

drop policy catalogue_publications_read on public.catalogue_publications;
create policy catalogue_publications_read
on public.catalogue_publications
for select
to anon, authenticated
using (
  (snapshot_id is not null and (select private.is_published_snapshot(snapshot_id)))
  or (select private.can_read_catalogue_drafts())
);

-- Snapshot and child insert policies.
do $$
declare
  child text;
begin
  foreach child in array array[
    'catalogue_snapshots',
    'course_snapshot_details',
    'structure_snapshot_details',
    'snapshot_field_evidence',
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
  public.catalogue_items,
  public.catalogue_item_years
from authenticated;

revoke insert on table
  public.catalogue_snapshots,
  public.course_snapshot_details,
  public.structure_snapshot_details,
  public.snapshot_field_evidence,
  public.requirement_rules,
  public.requirement_groups,
  public.requirement_conditions,
  public.requirement_condition_options,
  public.requirement_item_references
from authenticated;

drop function private.can_manage_catalogue();
