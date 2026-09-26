-- Courses a student has starred to come back to while planning.
--
-- A star belongs to the plan and names the course by its code, so it
-- outlives catalogue republishing and does not depend on a course version.

create table if not exists public.plan_starred_courses (
    id uuid default gen_random_uuid() not null,
    plan_id uuid not null,
    owner_id uuid not null,
    course_code text not null,
    created_at timestamp with time zone default now() not null,
    constraint plan_starred_courses_course_code_check check ((course_code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'::text))
);

alter table only public.plan_starred_courses
    add constraint plan_starred_courses_pkey primary key (id);

alter table only public.plan_starred_courses
    add constraint plan_starred_courses_plan_course_unique unique (plan_id, course_code);

alter table only public.plan_starred_courses
    add constraint plan_starred_courses_plan_id_fkey foreign key (plan_id)
      references public.plans(id) on delete cascade;

alter table only public.plan_starred_courses
    add constraint plan_starred_courses_owner_id_fkey foreign key (owner_id)
      references auth.users(id) on delete cascade;

create index plan_starred_courses_owner_id_idx
    on public.plan_starred_courses using btree (owner_id);

alter table public.plan_starred_courses enable row level security;

create policy plan_starred_courses_owner_select on public.plan_starred_courses
    for select to authenticated
    using ((( select auth.uid() as uid) = owner_id));

create policy plan_starred_courses_owner_insert on public.plan_starred_courses
    for insert to authenticated
    with check ((( select auth.uid() as uid) = owner_id));

create policy plan_starred_courses_owner_delete on public.plan_starred_courses
    for delete to authenticated
    using ((( select auth.uid() as uid) = owner_id));

revoke all on table public.plan_starred_courses from public, anon, authenticated, service_role;
grant all on table public.plan_starred_courses to service_role;
grant select, insert, delete on table public.plan_starred_courses to authenticated;

comment on table public.plan_starred_courses is 'Courses a student has starred in their plan to consider later.';

-- Stars or unstars a course in the caller's primary plan. The plan is found
-- from the session, so a caller can only ever write their own.
create or replace function public.set_current_user_course_star(
  p_course_code text,
  p_starred boolean
) returns void
    language plpgsql
    set search_path to ''
    as $$
declare
  v_user_id uuid := (select auth.uid());
  v_plan_id uuid;
  v_course_code text := upper(btrim(p_course_code));
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

  if not p_starred then
    delete from public.plan_starred_courses
    where plan_id = v_plan_id and course_code = v_course_code;
    return;
  end if;

  insert into public.plan_starred_courses (plan_id, owner_id, course_code)
  values (v_plan_id, v_user_id, v_course_code)
  on conflict (plan_id, course_code) do nothing;
end;
$$;

revoke all on function public.set_current_user_course_star(text, boolean) from public, anon, authenticated, service_role;
grant all on function public.set_current_user_course_star(text, boolean) to authenticated;
