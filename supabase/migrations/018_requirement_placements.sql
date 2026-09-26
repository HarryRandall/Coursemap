-- A student's choice of where a course counts in their degree.
--
-- Coursemap allocates each course in a plan to one part of the degree, most
-- specific first. A student may move a course to another part it qualifies
-- for, such as counting a course as an elective instead of towards a list.
-- The choice belongs to the plan and names the requirement by its structure
-- code and stable key, so it survives the structure being republished; a
-- choice the course no longer qualifies for is ignored rather than enforced.

create table if not exists public.plan_requirement_placements (
    id uuid default gen_random_uuid() not null,
    plan_id uuid not null,
    owner_id uuid not null,
    course_code text not null,
    structure_code text not null,
    requirement_key text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint plan_requirement_placements_course_code_check check ((course_code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'::text)),
    constraint plan_requirement_placements_structure_code_check check ((btrim(structure_code) <> ''::text)),
    constraint plan_requirement_placements_requirement_key_check check ((btrim(requirement_key) <> ''::text))
);

alter table only public.plan_requirement_placements
    add constraint plan_requirement_placements_pkey primary key (id);

alter table only public.plan_requirement_placements
    add constraint plan_requirement_placements_plan_course_unique unique (plan_id, course_code);

alter table only public.plan_requirement_placements
    add constraint plan_requirement_placements_plan_id_fkey foreign key (plan_id)
      references public.plans(id) on delete cascade;

alter table only public.plan_requirement_placements
    add constraint plan_requirement_placements_owner_id_fkey foreign key (owner_id)
      references auth.users(id) on delete cascade;

create index plan_requirement_placements_owner_id_idx
    on public.plan_requirement_placements using btree (owner_id);

alter table public.plan_requirement_placements enable row level security;

create policy plan_requirement_placements_owner_select on public.plan_requirement_placements
    for select to authenticated
    using ((( select auth.uid() as uid) = owner_id));

create policy plan_requirement_placements_owner_insert on public.plan_requirement_placements
    for insert to authenticated
    with check ((( select auth.uid() as uid) = owner_id));

create policy plan_requirement_placements_owner_update on public.plan_requirement_placements
    for update to authenticated
    using ((( select auth.uid() as uid) = owner_id))
    with check ((( select auth.uid() as uid) = owner_id));

create policy plan_requirement_placements_owner_delete on public.plan_requirement_placements
    for delete to authenticated
    using ((( select auth.uid() as uid) = owner_id));

revoke all on table public.plan_requirement_placements from public, anon, authenticated, service_role;
grant all on table public.plan_requirement_placements to service_role;
grant select, insert, update, delete on table public.plan_requirement_placements to authenticated;

comment on table public.plan_requirement_placements is 'A student''s choice of which part of their degree a course counts towards.';

-- Sets or clears where a course counts in the caller's primary plan. The
-- plan is found from the session, so a caller can only ever write their own.
create or replace function public.set_current_user_requirement_placement(
  p_course_code text,
  p_structure_code text default null,
  p_requirement_key text default null
) returns void
    language plpgsql
    set search_path to ''
    as $$
declare
  v_user_id uuid := (select auth.uid());
  v_plan_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'You must be signed in to update a plan.';
  end if;

  select plans.id into v_plan_id
  from public.plans
  where plans.owner_id = v_user_id and plans.is_primary and plans.status = 'active';

  if v_plan_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Your primary plan was not found.';
  end if;

  if p_requirement_key is null then
    delete from public.plan_requirement_placements
    where plan_id = v_plan_id and course_code = upper(btrim(p_course_code));
    return;
  end if;

  insert into public.plan_requirement_placements (
    plan_id, owner_id, course_code, structure_code, requirement_key
  ) values (
    v_plan_id, v_user_id, upper(btrim(p_course_code)), upper(btrim(p_structure_code)),
    btrim(p_requirement_key)
  )
  on conflict (plan_id, course_code) do update
    set structure_code = excluded.structure_code,
        requirement_key = excluded.requirement_key,
        updated_at = now();
end;
$$;

revoke all on function public.set_current_user_requirement_placement(text, text, text) from public, anon, authenticated, service_role;
grant all on function public.set_current_user_requirement_placement(text, text, text) to authenticated;
