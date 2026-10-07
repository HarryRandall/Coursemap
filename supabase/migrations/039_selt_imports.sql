-- SELT is course-wide historical survey data, independent of annual catalogue versions.
create table public.selt_import_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default now() + interval '12 hours',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.selt_reports (
  id uuid primary key default gen_random_uuid(),
  code_id bigint not null references public.catalogue_codes(id),
  import_run_id uuid not null references public.selt_import_runs(id),
  course_name text not null,
  subject_owner text,
  source_name text,
  source_contact text,
  report_run_at_raw text,
  page_count integer not null check (page_count between 1 and 20),
  text_extractor text not null,
  chart_extractor text not null,
  schema_version text not null,
  source_url text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_filename text not null,
  source_bytes integer not null check (source_bytes > 0),
  report_run_at timestamp,
  parser_version text not null,
  notes text[] not null default '{}',
  warnings text[] not null default '{}',
  published_at timestamptz,
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (code_id, source_sha256, parser_version)
);
create unique index selt_reports_published_code_idx on public.selt_reports (code_id) where published_at is not null;
create index selt_reports_run_idx on public.selt_reports (import_run_id);
create index selt_reports_publisher_idx on public.selt_reports (published_by);
create index selt_import_runs_user_idx on public.selt_import_runs (requested_by);
create table public.selt_surveys (
  report_id uuid not null references public.selt_reports(id) on delete cascade,
  year integer not null check (year between 1990 and 2100),
  session text not null check (session in ('sem_1', 'sem_2')),
  label text not null,
  enrolments integer check (enrolments >= 0),
  respondents integer check (respondents >= 0 and respondents <= enrolments),
  response_rate_percent integer check (response_rate_percent between 0 and 100),
  teaching_and_learning_activities integer check (teaching_and_learning_activities between 0 and 100),
  workload integer check (workload between 0 and 100),
  feedback integer check (feedback between 0 and 100),
  analytical_development integer check (analytical_development between 0 and 100),
  overall_learning_experience integer check (overall_learning_experience between 0 and 100),
  primary key (report_id, year, session),
  check (coalesce(respondents >= 5, false) or (teaching_and_learning_activities is null and workload is null and feedback is null and analytical_development is null and overall_learning_experience is null))
);
create table public.selt_question_themes (
  report_id uuid not null references public.selt_reports(id) on delete cascade,
  key text not null check (key in ('teaching_and_learning_activities', 'workload', 'feedback', 'analytical_development', 'overall_learning_experience')),
  label text not null,
  introduced_year integer not null check (introduced_year between 1990 and 2100),
  primary key (report_id, key)
);
alter table public.selt_question_themes enable row level security;
alter table public.selt_import_runs enable row level security;
alter table public.selt_reports enable row level security;
alter table public.selt_surveys enable row level security;
revoke all on public.selt_import_runs, public.selt_reports, public.selt_surveys, public.selt_question_themes from public, anon, authenticated, service_role;
grant all on public.selt_import_runs, public.selt_reports, public.selt_surveys, public.selt_question_themes to service_role;
-- Token hashes are server-only, including for administrators.
grant select on public.selt_reports, public.selt_surveys, public.selt_question_themes to authenticated;
create policy selt_reports_admin_read on public.selt_reports for select to authenticated
  using ((select private.has_permission('imports.manage')));
create policy selt_surveys_admin_read on public.selt_surveys for select to authenticated
  using ((select private.has_permission('imports.manage')));
create policy selt_question_themes_admin_read on public.selt_question_themes for select to authenticated
  using ((select private.has_permission('imports.manage')));
