create table public.plan_course_overrides (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid not null,
    owner_id uuid not null references auth.users(id) on delete cascade,
    course_code text not null check (course_code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'),
    reason text not null check (reason in ('approval', 'credit', 'data_error', 'other')),
    note text check (char_length(note) <= 500),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint plan_course_overrides_plan_owner_fkey foreign key (plan_id, owner_id)
        references public.plans(id, owner_id) on delete cascade,
    unique (plan_id, course_code)
);
create index plan_course_overrides_owner_idx on public.plan_course_overrides(owner_id);
create index plan_course_overrides_plan_owner_idx on public.plan_course_overrides(plan_id, owner_id);
create trigger plan_course_overrides_set_updated_at before update on public.plan_course_overrides
    for each row execute function private.set_updated_at();
alter table public.plan_course_overrides enable row level security;
revoke all on public.plan_course_overrides from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.plan_course_overrides to authenticated;
grant all on public.plan_course_overrides to service_role;
create policy plan_course_overrides_owner on public.plan_course_overrides for all to authenticated
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create table public.plan_requirement_overrides (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid not null,
    owner_id uuid not null references auth.users(id) on delete cascade,
    structure_code text not null check (btrim(structure_code) <> ''),
    requirement_key text not null check (btrim(requirement_key) <> ''),
    reason text not null check (reason in ('approval', 'credit', 'data_error', 'other')),
    note text check (char_length(note) <= 500),
    credited_units integer check (credited_units >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint plan_requirement_overrides_plan_owner_fkey foreign key (plan_id, owner_id)
        references public.plans(id, owner_id) on delete cascade,
    unique (plan_id, structure_code, requirement_key)
);
create index plan_requirement_overrides_owner_idx on public.plan_requirement_overrides(owner_id);
create index plan_requirement_overrides_plan_owner_idx on public.plan_requirement_overrides(plan_id, owner_id);
create trigger plan_requirement_overrides_set_updated_at before update on public.plan_requirement_overrides
    for each row execute function private.set_updated_at();
alter table public.plan_requirement_overrides enable row level security;
revoke all on public.plan_requirement_overrides from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.plan_requirement_overrides to authenticated;
grant all on public.plan_requirement_overrides to service_role;
create policy plan_requirement_overrides_owner on public.plan_requirement_overrides for all to authenticated
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

