-- Administrators freeze a capped manifest; workers reserve spend before paid calls.
create table public.catalogue_course_runs (
  id uuid primary key default gen_random_uuid(),
  academic_year integer not null check (academic_year between 2020 and 2030),
  requested_by uuid not null references auth.users(id),
  requested_model text not null references public.import_models(id),
  course_limit integer not null check (course_limit between 1 and 100),
  budget_usd numeric not null check (budget_usd > 0 and budget_usd <= 10),
  input_usd_per_million numeric not null check (input_usd_per_million >= 0),
  output_usd_per_million numeric not null check (output_usd_per_million >= 0),
  publish_verified boolean not null default false,
  state text not null default 'active' check (state in ('active', 'paused', 'cancelled')),
  pause_reason text,
  created_at timestamptz not null default now()
);
create table public.catalogue_course_run_items (
  run_id uuid not null references public.catalogue_course_runs(id),
  record_id bigint not null references public.catalogue_records(id),
  sync_id uuid not null unique references public.catalogue_syncs(id),
  reserved_usd numeric not null default 0 check (reserved_usd >= 0),
  actual_usd numeric check (actual_usd >= 0),
  published_version_id bigint references public.catalogue_versions(id),
  primary key (run_id, record_id)
);
alter table public.catalogue_course_runs enable row level security;
alter table public.catalogue_course_run_items enable row level security;
revoke all on public.catalogue_course_runs, public.catalogue_course_run_items from public, anon, authenticated, service_role;
grant select on public.catalogue_course_runs, public.catalogue_course_run_items to authenticated;
grant all on public.catalogue_course_runs, public.catalogue_course_run_items to service_role;
create policy catalogue_course_runs_admin_read on public.catalogue_course_runs for select to authenticated
  using ((select private.has_permission('imports.manage')));
create policy catalogue_course_run_items_admin_read on public.catalogue_course_run_items for select to authenticated
  using ((select private.has_permission('imports.manage')));

create index catalogue_course_runs_year_idx on public.catalogue_course_runs (academic_year, created_at desc);
create index catalogue_course_runs_user_idx on public.catalogue_course_runs (requested_by);
create index catalogue_course_runs_model_idx on public.catalogue_course_runs (requested_model);
create index catalogue_course_run_items_record_idx on public.catalogue_course_run_items (record_id);
create index catalogue_course_run_items_publication_idx on public.catalogue_course_run_items (published_version_id);
