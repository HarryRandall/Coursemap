begin;

-- One import pipeline for every catalogue kind. A run targets one kind and
-- one academic year; each target processes one directory entry through the
-- same stages and, when the content differs from the baseline version,
-- produces a candidate version for review.

-- Directory ----------------------------------------------------------------------------

create table public.catalogue_directory_entries (
  id bigint generated always as identity primary key,
  academic_year_id bigint not null,
  kind text not null,
  code text not null,
  title text,
  code_id bigint,
  source_page_id bigint,
  summary jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint catalogue_directory_entries_unique unique (academic_year_id, kind, code),
  constraint catalogue_directory_entries_academic_year_fkey
    foreign key (academic_year_id) references public.academic_years (id),
  constraint catalogue_directory_entries_item_fkey
    foreign key (code_id, kind) references public.catalogue_codes (id, kind),
  constraint catalogue_directory_entries_source_page_fkey
    foreign key (source_page_id, academic_year_id)
    references public.catalogue_source_pages (id, academic_year_id),
  constraint catalogue_directory_entries_kind_check check (
    kind in ('course', 'programme', 'major', 'minor', 'specialisation')
  ),
  constraint catalogue_directory_entries_summary_check check (
    jsonb_typeof(summary) = 'object'
  )
);

create index catalogue_directory_entries_lookup_idx
  on public.catalogue_directory_entries (academic_year_id, kind, is_current, code);

create table public.catalogue_directory_statuses (
  academic_year_id bigint not null,
  kind text not null,
  status text not null default 'never',
  entry_count integer not null default 0,
  refreshed_at timestamptz,
  message text,
  constraint catalogue_directory_statuses_pkey primary key (academic_year_id, kind),
  constraint catalogue_directory_statuses_academic_year_fkey
    foreign key (academic_year_id) references public.academic_years (id),
  constraint catalogue_directory_statuses_kind_check check (
    kind in ('course', 'programme', 'major', 'minor', 'specialisation')
  ),
  constraint catalogue_directory_statuses_status_check check (
    status in ('never', 'refreshing', 'available', 'failed')
  )
);

-- Runs and targets --------------------------------------------------------------------

create table public.catalogue_import_runs (
  id uuid primary key default gen_random_uuid(),
  run_number bigint generated always as identity,
  academic_year_id bigint not null,
  kind text not null,
  status text not null default 'queued',
  requested_model text not null,
  parser_version text not null,
  prompt_version text not null,
  schema_version text not null,
  requested_by uuid,
  target_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint catalogue_import_runs_run_number_unique unique (run_number),
  constraint catalogue_import_runs_academic_year_fkey
    foreign key (academic_year_id) references public.academic_years (id),
  constraint catalogue_import_runs_model_fkey
    foreign key (requested_model) references public.import_models (id),
  constraint catalogue_import_runs_requested_by_fkey
    foreign key (requested_by) references auth.users (id) on delete set null,
  constraint catalogue_import_runs_kind_check check (
    kind in ('course', 'programme', 'major', 'minor', 'specialisation')
  ),
  constraint catalogue_import_runs_status_check check (
    status in ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  constraint catalogue_import_runs_versions_check check (
    btrim(parser_version) <> '' and btrim(prompt_version) <> '' and btrim(schema_version) <> ''
  )
);

create index catalogue_import_runs_recent_idx
  on public.catalogue_import_runs (kind, created_at desc);

create table public.catalogue_import_targets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  kind text not null,
  code text not null,
  academic_year_id bigint not null,
  code_id bigint not null,
  record_id bigint not null,
  directory_entry_id bigint,
  baseline_version_id bigint,
  candidate_version_id bigint,
  source_page_id bigint,
  status text not null default 'queued',
  change_kind text,
  attempt_count integer not null default 0,
  lock_version integer not null default 0,
  worker_id uuid,
  lease_expires_at timestamptz,
  queue_message_id text,
  dispatched_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint catalogue_import_targets_run_item_unique unique (run_id, code_id),
  constraint catalogue_import_targets_run_fkey
    foreign key (run_id) references public.catalogue_import_runs (id) on delete cascade,
  constraint catalogue_import_targets_item_fkey
    foreign key (code_id, kind) references public.catalogue_codes (id, kind),
  constraint catalogue_import_targets_item_year_fkey
    foreign key (record_id, academic_year_id)
    references public.catalogue_records (id, academic_year_id),
  constraint catalogue_import_targets_directory_entry_fkey
    foreign key (directory_entry_id) references public.catalogue_directory_entries (id),
  constraint catalogue_import_targets_baseline_fkey
    foreign key (baseline_version_id, record_id)
    references public.catalogue_versions (id, record_id),
  constraint catalogue_import_targets_candidate_fkey
    foreign key (candidate_version_id, record_id)
    references public.catalogue_versions (id, record_id),
  constraint catalogue_import_targets_source_page_fkey
    foreign key (source_page_id, academic_year_id)
    references public.catalogue_source_pages (id, academic_year_id),
  constraint catalogue_import_targets_status_check check (
    status in ('queued', 'running', 'ready', 'unchanged', 'failed', 'cancelled')
  ),
  constraint catalogue_import_targets_change_kind_check check (
    change_kind is null or change_kind in ('new', 'changed', 'unchanged')
  ),
  constraint catalogue_import_targets_attempts_check check (attempt_count between 0 and 5)
);

create index catalogue_import_targets_run_idx
  on public.catalogue_import_targets (run_id, created_at);

create index catalogue_import_targets_record_idx
  on public.catalogue_import_targets (record_id, created_at desc);

-- An item year has at most one unfinished target across all runs.
create unique index catalogue_import_targets_active_record_idx
  on public.catalogue_import_targets (record_id)
  where status in ('queued', 'running');

create trigger catalogue_import_targets_set_updated_at
before update on public.catalogue_import_targets
for each row execute function private.set_updated_at();

alter table public.catalogue_versions
  add column import_target_id uuid,
  add constraint catalogue_versions_import_target_fkey
    foreign key (import_target_id) references public.catalogue_import_targets (id)
    on delete set null;

-- Removing a run or a user detaches the version's provenance links. Those
-- and the sealing itself are the only changes a sealed version accepts.
create or replace function private.enforce_catalogue_version_immutability()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and old.sealed_at is null
    and new.sealed_at is not null
    and (to_jsonb(new) - 'sealed_at') = (to_jsonb(old) - 'sealed_at')
  then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'import_target_id' - 'created_by')
      = (to_jsonb(old) - 'import_target_id' - 'created_by')
    and (new.import_target_id is null or new.import_target_id = old.import_target_id)
    and (new.created_by is null or new.created_by = old.created_by)
  then
    return new;
  end if;
  raise exception
    'Catalogue versions are immutable; create a new version instead.'
    using errcode = '55000';
end;
$function$;

create table public.catalogue_import_stages (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null,
  stage_name text not null,
  attempt_number integer not null,
  status text not null default 'running',
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  error_code text,
  error_summary text,
  constraint catalogue_import_stages_unique unique (target_id, stage_name, attempt_number),
  constraint catalogue_import_stages_target_fkey
    foreign key (target_id) references public.catalogue_import_targets (id) on delete cascade,
  constraint catalogue_import_stages_name_check check (
    stage_name in (
      'source_fetch', 'html_capture', 'markdown_normalise', 'model_input_prepare',
      'deterministic_extract', 'model_extract', 'schema_validate', 'domain_validate',
      'database_project', 'snapshot_persist'
    )
  ),
  constraint catalogue_import_stages_status_check check (
    status in ('running', 'completed', 'failed')
  )
);

create index catalogue_import_stages_target_idx
  on public.catalogue_import_stages (target_id, started_at);

create table public.catalogue_import_artifacts (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null,
  stage_id uuid not null,
  kind text not null,
  attempt_number integer not null,
  media_type text not null,
  content_sha256 text not null,
  byte_size integer not null,
  storage_bucket text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint catalogue_import_artifacts_target_fkey
    foreign key (target_id) references public.catalogue_import_targets (id) on delete cascade,
  constraint catalogue_import_artifacts_stage_fkey
    foreign key (stage_id) references public.catalogue_import_stages (id) on delete cascade,
  constraint catalogue_import_artifacts_kind_check check (
    kind in (
      'raw_html', 'normalised_markdown', 'model_input', 'deterministic_output',
      'model_request', 'model_response', 'validated_json', 'validation_report',
      'database_projection', 'change_set'
    )
  ),
  constraint catalogue_import_artifacts_sha_check check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint catalogue_import_artifacts_size_check check (byte_size >= 0)
);

create index catalogue_import_artifacts_target_idx
  on public.catalogue_import_artifacts (target_id, created_at);

-- Artefact records never change, but they leave with their run.
create trigger catalogue_import_artifacts_reject_mutation
before update on public.catalogue_import_artifacts
for each row execute function private.reject_immutable_catalogue_record_mutation();

create table public.catalogue_extractions (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null,
  extraction_number integer not null,
  requested_model text not null,
  resolved_model text,
  fingerprint text not null,
  prompt_version text not null,
  schema_version text not null,
  request_artifact_id uuid not null,
  response_artifact_id uuid,
  validated_artifact_id uuid,
  reused_from_extraction_id uuid,
  provider_request_id text,
  finish_reason text,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  cost_source text not null default 'unknown',
  latency_ms integer,
  validation_status text not null default 'pending',
  schema_valid boolean,
  domain_valid boolean,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_summary text,
  constraint catalogue_extractions_target_number_unique unique (target_id, extraction_number),
  constraint catalogue_extractions_target_fkey
    foreign key (target_id) references public.catalogue_import_targets (id) on delete cascade,
  constraint catalogue_extractions_request_artifact_fkey
    foreign key (request_artifact_id) references public.catalogue_import_artifacts (id),
  constraint catalogue_extractions_response_artifact_fkey
    foreign key (response_artifact_id) references public.catalogue_import_artifacts (id),
  constraint catalogue_extractions_validated_artifact_fkey
    foreign key (validated_artifact_id) references public.catalogue_import_artifacts (id),
  constraint catalogue_extractions_reused_fkey
    foreign key (reused_from_extraction_id) references public.catalogue_extractions (id),
  constraint catalogue_extractions_cost_source_check check (
    cost_source in ('provider', 'cache', 'unknown')
  ),
  constraint catalogue_extractions_validation_status_check check (
    validation_status in ('pending', 'valid', 'invalid')
  ),
  constraint catalogue_extractions_fingerprint_check check (fingerprint ~ '^[0-9a-f]{64}$')
);

create index catalogue_extractions_fingerprint_idx
  on public.catalogue_extractions (fingerprint, validation_status);

-- Lifecycle ----------------------------------------------------------------------------

create or replace function private.refresh_catalogue_import_run(p_run_id uuid)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  total integer;
  unfinished integer;
  failed integer;
  cancelled integer;
  running integer;
begin
  select
    count(*),
    count(*) filter (where status in ('queued', 'running')),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status = 'running')
  into total, unfinished, failed, cancelled, running
  from public.catalogue_import_targets
  where run_id = p_run_id;

  update public.catalogue_import_runs
  set
    target_count = total,
    completed_count = total - unfinished - failed - cancelled,
    failed_count = failed,
    started_at = case
      when started_at is null and (running > 0 or unfinished < total) then now()
      else started_at
    end,
    status = case
      when unfinished > 0 and running > 0 then 'running'
      when unfinished > 0 then case when started_at is null then 'queued' else 'running' end
      when cancelled = total then 'cancelled'
      when failed = total then 'failed'
      else 'completed'
    end,
    completed_at = case when unfinished > 0 then null else coalesce(completed_at, now()) end,
    input_tokens = coalesce((
      select sum(extractions.input_tokens)
      from public.catalogue_extractions as extractions
      join public.catalogue_import_targets as targets on targets.id = extractions.target_id
      where targets.run_id = p_run_id
    ), 0),
    output_tokens = coalesce((
      select sum(extractions.output_tokens)
      from public.catalogue_extractions as extractions
      join public.catalogue_import_targets as targets on targets.id = extractions.target_id
      where targets.run_id = p_run_id
    ), 0),
    cost_usd = coalesce((
      select sum(extractions.cost_usd)
      from public.catalogue_extractions as extractions
      join public.catalogue_import_targets as targets on targets.id = extractions.target_id
      where targets.run_id = p_run_id
    ), 0)
  where id = p_run_id;
end;
$function$;

revoke all on function private.refresh_catalogue_import_run(uuid) from public, anon, authenticated;

-- Targets whose worker lease expired return to the queue until they run out of
-- attempts. Queued targets that were never dispatched fail after 30 minutes.
create or replace function private.recover_stale_catalogue_import_targets()
returns integer
language plpgsql
set search_path = ''
as $function$
declare
  recovered integer := 0;
  affected_runs uuid[];
begin
  with expired as (
    update public.catalogue_import_targets
    set
      status = case when attempt_count >= 5 then 'failed' else 'queued' end,
      worker_id = null,
      lease_expires_at = null,
      error_code = case when attempt_count >= 5 then 'LEASE_EXPIRED' else error_code end,
      error_message = case
        when attempt_count >= 5 then 'The worker lease expired after the final attempt.'
        else error_message
      end,
      completed_at = case when attempt_count >= 5 then now() else null end
    where status = 'running'
      and lease_expires_at < now()
    returning run_id
  ),
  stale as (
    update public.catalogue_import_targets
    set
      status = 'failed',
      error_code = 'QUEUE_DISPATCH_STALE',
      error_message = 'The target stayed queued for more than 30 minutes without a worker.',
      completed_at = now()
    where status = 'queued'
      and coalesce(dispatched_at, created_at) < now() - interval '30 minutes'
    returning run_id
  )
  select array_agg(distinct run_id), count(*)
  into affected_runs, recovered
  from (select run_id from expired union all select run_id from stale) as changed;

  if affected_runs is not null then
    perform private.refresh_catalogue_import_run(run_id)
    from unnest(affected_runs) as runs(run_id);
  end if;

  return coalesce(recovered, 0);
end;
$function$;

revoke all on function private.recover_stale_catalogue_import_targets() from public, anon, authenticated;

-- Creates a run and its targets for up to ten directory entries. Identities and
-- item years are created on demand so a first import has somewhere to land.
create or replace function public.start_catalogue_import(
  p_academic_year smallint,
  p_kind text,
  p_codes text[],
  p_requested_model text,
  p_parser_version text,
  p_prompt_version text,
  p_schema_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  user_id uuid := (select auth.uid());
  selected_year_id bigint;
  created_run_id uuid;
  requested_code text;
  created_targets jsonb := '[]'::jsonb;
  selected_item_id bigint;
  selected_record_id bigint;
  selected_baseline bigint;
  selected_directory_entry_id bigint;
  created_target_id uuid;
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Managing imports requires the imports.manage permission.';
  end if;
  if p_kind not in ('course', 'programme', 'major', 'minor', 'specialisation') then
    raise exception using errcode = '22023', message = 'The catalogue kind is not recognised.';
  end if;
  if p_codes is null or cardinality(p_codes) = 0 then
    raise exception using errcode = '22023', message = 'Select at least one record to import.';
  end if;
  if cardinality(p_codes) > 10 then
    raise exception using errcode = '22023', message = 'An import run accepts at most ten records.';
  end if;
  if not exists (
    select 1 from public.import_models where id = p_requested_model and enabled and visible
  ) then
    raise exception using errcode = '22023', message = 'Choose an enabled import model.';
  end if;

  select id into selected_year_id from public.academic_years where year = p_academic_year;
  if selected_year_id is null then
    raise exception using errcode = 'P0002', message = 'The academic year is not available for imports.';
  end if;

  perform private.recover_stale_catalogue_import_targets();

  insert into public.catalogue_import_runs (
    academic_year_id, kind, requested_model, parser_version, prompt_version,
    schema_version, requested_by, target_count
  ) values (
    selected_year_id, p_kind, p_requested_model, p_parser_version, p_prompt_version,
    p_schema_version, user_id, cardinality(p_codes)
  )
  returning id into created_run_id;

  for requested_code in
    select distinct upper(btrim(code)) from unnest(p_codes) as requested(code)
    where nullif(btrim(code), '') is not null
  loop
    insert into public.catalogue_codes (kind, code)
    values (p_kind, requested_code)
    on conflict (kind, code) do nothing;

    select id into selected_item_id
    from public.catalogue_codes where kind = p_kind and code = requested_code;

    insert into public.catalogue_records (code_id, kind, academic_year_id)
    values (selected_item_id, p_kind, selected_year_id)
    on conflict (code_id, academic_year_id) do nothing;

    select records.id, latest.id
    into selected_record_id, selected_baseline
    from public.catalogue_records as records
    left join lateral (
      select versions.id
      from public.catalogue_versions as versions
      left join public.catalogue_import_targets as targets
        on targets.id = versions.import_target_id
      where versions.record_id = records.id
        and versions.sealed_at is not null
        and (
          versions.import_target_id is null
          or targets.applied_version_id = versions.id
        )
      order by versions.created_at desc, versions.id desc
      limit 1
    ) as latest on true
    where records.code_id = selected_item_id
      and records.academic_year_id = selected_year_id;

    if exists (
      select 1 from public.catalogue_records
      where id = selected_record_id and archived_at is not null
    ) then
      raise exception using
        errcode = '55000',
        message = format('%s is archived for %s and cannot be imported.', requested_code, p_academic_year);
    end if;

    if exists (
      select 1 from public.catalogue_import_targets
      where record_id = selected_record_id and status in ('queued', 'running')
    ) then
      raise exception using
        errcode = '55000',
        message = format('%s already has an unfinished import for %s.', requested_code, p_academic_year);
    end if;

    select id into selected_directory_entry_id
    from public.catalogue_directory_entries
    where academic_year_id = selected_year_id and kind = p_kind and code = requested_code;

    insert into public.catalogue_import_targets (
      run_id, kind, code, academic_year_id, code_id, record_id,
      directory_entry_id, baseline_version_id
    ) values (
      created_run_id, p_kind, requested_code, selected_year_id, selected_item_id,
      selected_record_id, selected_directory_entry_id, selected_baseline
    )
    returning id into created_target_id;

    created_targets := created_targets || jsonb_build_object(
      'targetId', created_target_id,
      'code', requested_code
    );
  end loop;

  perform private.refresh_catalogue_import_run(created_run_id);

  return jsonb_build_object('runId', created_run_id, 'targets', created_targets);
end;
$function$;

revoke all on function public.start_catalogue_import(smallint, text, text[], text, text, text, text)
from public, anon;
grant execute on function public.start_catalogue_import(smallint, text, text[], text, text, text, text)
to authenticated;

-- Cancels every unfinished target of a run. Running workers notice the missing
-- lease when they next record a result.
create or replace function public.cancel_catalogue_import(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cancelled integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Managing imports requires the imports.manage permission.';
  end if;

  with changed as (
    update public.catalogue_import_targets
    set
      status = 'cancelled',
      worker_id = null,
      lease_expires_at = null,
      lock_version = lock_version + 1,
      error_code = 'CANCELLED',
      error_message = 'The run was stopped by an administrator.',
      completed_at = now()
    where run_id = p_run_id
      and status in ('queued', 'running')
    returning id
  )
  select count(*) into cancelled from changed;

  perform private.refresh_catalogue_import_run(p_run_id);
  return cancelled;
end;
$function$;

revoke all on function public.cancel_catalogue_import(uuid) from public, anon;
grant execute on function public.cancel_catalogue_import(uuid) to authenticated;

-- Access -------------------------------------------------------------------------------

do $$
declare
  relation text;
begin
  foreach relation in array array[
    'catalogue_directory_entries',
    'catalogue_directory_statuses',
    'catalogue_import_runs',
    'catalogue_import_targets',
    'catalogue_import_stages',
    'catalogue_import_artifacts',
    'catalogue_extractions'
  ] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using ((select private.has_permission(''imports.manage'')))',
      relation || '_import_admin_read', relation
    );
    execute format('grant select on table public.%I to authenticated', relation);
    execute format('grant select, insert, update, delete on table public.%I to service_role', relation);
  end loop;
end;
$$;

comment on table public.catalogue_directory_entries is
  'Year-specific listing of catalogue codes discovered on the ANU site, one row per kind and code.';
comment on table public.catalogue_import_runs is
  'A batch of up to ten import targets for one catalogue kind and academic year.';
comment on table public.catalogue_import_targets is
  'One record processed by an import run. ready means a candidate snapshot awaits review.';

commit;
