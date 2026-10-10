-- Student data access, tightened after the October 2026 access audit.
--
-- 1. Students read published catalogue content only. The default `user` role
--    held catalogue.read_drafts and courses.read_drafts, so every sign-up could
--    read drafts, ANU review rows and the change history through the Data API.
-- 2. Reading another student's plan, attempts or student number is its own
--    permission, students.read, rather than something admin.access implies.
-- 3. Rows that hang off a plan must belong to that plan's owner. Placements,
--    stars and plan structures checked only their own owner_id, so one student
--    could attach rows to another student's plan.
-- 4. Catalogue records for unpublished years are no longer visible merely
--    because the same code is published in another year.

-- 1. Drafts are for catalogue staff -----------------------------------------

delete from private.role_permissions as role_permissions
using private.app_roles as roles, private.app_permissions as permissions
where role_permissions.role_id = roles.id
  and role_permissions.permission_id = permissions.id
  and roles.key = 'user'
  and permissions.key in ('catalogue.read_drafts', 'courses.read_drafts');

-- 2. Student records need their own permission ------------------------------

insert into private.app_permissions (key, name, description, category)
values (
  'students.read',
  'View student records',
  'View other students'' plans, results and student numbers.',
  'students'
);

-- Administrators keep what they had, now as a grant that can be removed.
insert into private.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from private.app_roles as roles, private.app_permissions as permissions
where roles.key = 'admin'
  and permissions.key = 'students.read';

drop policy plans_owner_or_admin_select on public.plans;
create policy plans_owner_or_reader_select on public.plans
  for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or (select private.has_permission('students.read'))
  );

drop policy plan_items_owner_or_admin_select on public.plan_items;
create policy plan_items_owner_or_reader_select on public.plan_items
  for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or (select private.has_permission('students.read'))
  );

drop policy plan_structures_owner_or_admin_select on public.plan_structures;
create policy plan_structures_owner_or_reader_select on public.plan_structures
  for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or (select private.has_permission('students.read'))
  );

drop policy course_attempts_owner_or_admin_select on public.course_attempts;
create policy course_attempts_owner_or_reader_select on public.course_attempts
  for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or (select private.has_permission('students.read'))
  );

-- Account management still lists every account under admin.access, but the
-- student number is a student record.
create or replace view public.admin_users with (security_invoker = 'true') as
  select
    id as user_id,
    email,
    display_name,
    created_at,
    updated_at,
    case
      when (select private.has_permission('students.read')) then student_number
    end as student_number
  from public.profiles as profiles
  where (select private.has_permission('admin.access'));

-- 3. Plan rows belong to the plan's owner -----------------------------------

-- Rows written before this migration may point at a deleted plan (plan
-- structures never had a plan foreign key) or at someone else's plan. Neither
-- is reachable through the application, so they are removed.
delete from public.plan_structures as structures
where not exists (
  select 1
  from public.plans as plans
  where plans.id = structures.plan_id
    and plans.owner_id = structures.owner_id
);

delete from public.plan_requirement_placements as placements
where not exists (
  select 1
  from public.plans as plans
  where plans.id = placements.plan_id
    and plans.owner_id = placements.owner_id
);

delete from public.plan_starred_courses as stars
where not exists (
  select 1
  from public.plans as plans
  where plans.id = stars.plan_id
    and plans.owner_id = stars.owner_id
);

alter table public.plan_structures
  add constraint plan_structures_plan_owner_fkey
    foreign key (plan_id, owner_id) references public.plans(id, owner_id)
    on delete cascade;

alter table public.plan_requirement_placements
  drop constraint plan_requirement_placements_plan_id_fkey,
  add constraint plan_requirement_placements_plan_owner_fkey
    foreign key (plan_id, owner_id) references public.plans(id, owner_id)
    on delete cascade;

alter table public.plan_starred_courses
  drop constraint plan_starred_courses_plan_id_fkey,
  add constraint plan_starred_courses_plan_owner_fkey
    foreign key (plan_id, owner_id) references public.plans(id, owner_id)
    on delete cascade;

-- 4. Unpublished years stay private -----------------------------------------

-- A student still reads the records their own plan or results point at, so a
-- planned course whose year is later unpublished can be named and flagged.
create function private.is_current_user_catalogue_record(p_record_id bigint)
  returns boolean
  language sql stable security definer
  set search_path to ''
  as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.plan_items as items
        where items.catalogue_record_id = p_record_id
          and items.owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.plan_structures as structures
        where structures.catalogue_record_id = p_record_id
          and structures.owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.course_attempts as attempts
        join public.catalogue_versions as versions
          on versions.id = attempts.catalogue_version_id
        where versions.record_id = p_record_id
          and attempts.owner_id = (select auth.uid())
      )
    );
$$;

revoke all on function private.is_current_user_catalogue_record(bigint) from public;
grant execute on function private.is_current_user_catalogue_record(bigint) to anon, authenticated;

drop policy catalogue_records_read on public.catalogue_records;
create policy catalogue_records_read on public.catalogue_records
  for select to authenticated, anon
  using (
    (published_version_id is not null and archived_at is null)
    or (select private.can_read_catalogue_drafts())
    or private.is_current_user_catalogue_record(id)
  );

-- The same holds for the code itself when no year of it is published.
create function private.is_current_user_catalogue_code(p_code_id bigint)
  returns boolean
  language sql stable security definer
  set search_path to ''
  as $$
  select exists (
    select 1
    from public.catalogue_records as records
    where records.code_id = p_code_id
      and private.is_current_user_catalogue_record(records.id)
  );
$$;

revoke all on function private.is_current_user_catalogue_code(bigint) from public;
grant execute on function private.is_current_user_catalogue_code(bigint) to anon, authenticated;

drop policy catalogue_codes_read on public.catalogue_codes;
create policy catalogue_codes_read on public.catalogue_codes
  for select to authenticated, anon
  using (
    (select private.can_read_catalogue_item(catalogue_codes.id))
    or private.is_current_user_catalogue_code(id)
  );

-- 5. Smaller exposures -------------------------------------------------------

-- Whether a record exists, is archived or has a draft is editorial state.
create or replace function public.catalogue_publish_blockers(p_record_id bigint)
  returns text[]
  language plpgsql stable security definer
  set search_path to ''
  as $$
declare
  blockers text[];
begin
  if not (select private.can_read_catalogue_drafts()) then
    raise exception 'Catalogue staff only.' using errcode = '42501';
  end if;

  select array_remove(array[
    case when records.id is null then 'The record does not exist.' end,
    case when records.archived_at is not null then 'The record is archived.' end,
    case when records.id is not null and drafts.record_id is null
      then 'There is no draft to publish.' end
  ], null)
  into blockers
  from (select p_record_id as requested_id) as requested
  left join public.catalogue_records as records on records.id = requested.requested_id
  left join public.catalogue_drafts as drafts on drafts.record_id = records.id;

  return blockers;
end;
$$;

-- Publication intervals are public; who published is not.
revoke select on table public.catalogue_publications from anon;
grant select (id, record_id, version_id, published_at, unpublished_at)
  on table public.catalogue_publications to anon;

-- Functions created later in public are not callable by anon or signed-in
-- users until a migration grants them explicitly.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

revoke all on function private.notify_catalogue_sync_finished() from public;
