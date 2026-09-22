begin;

-- Record-level ANU synchronisation replaces the former batch run and target
-- model. The database is disposable, so obsolete review and execution state is
-- removed instead of being kept behind compatibility views.

drop function if exists public.resolve_catalogue_import_change(bigint, text, text) cascade;
drop function if exists public.start_catalogue_import(smallint, text, text[], text, text, text, text) cascade;
drop function if exists public.cancel_catalogue_import(uuid) cascade;
drop function if exists public.release_catalogue_import_target(uuid) cascade;
drop function if exists public.recover_catalogue_import_targets() cascade;
drop function if exists private.recover_stale_catalogue_import_targets() cascade;
drop function if exists private.refresh_catalogue_import_run(uuid) cascade;
drop function if exists private.close_catalogue_import_stages(uuid, text, text) cascade;
drop function if exists private.notify_catalogue_import_run_finished() cascade;
drop function if exists public.publish_catalogue_version(bigint);
drop function if exists public.delete_catalogue_item(text, text);

drop table if exists public.catalogue_import_changes cascade;
drop table if exists public.catalogue_extractions cascade;
drop table if exists public.catalogue_import_artifacts cascade;
drop table if exists public.catalogue_import_stages cascade;

alter table public.catalogue_versions
  drop constraint if exists catalogue_versions_import_target_fkey,
  drop column if exists import_target_id;

drop table if exists public.catalogue_import_targets cascade;
drop table if exists public.catalogue_import_runs cascade;

create or replace function public.catalogue_publish_blockers(p_record_id bigint)
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  select array_remove(array[
    case when records.id is null then 'The record does not exist.' end,
    case when records.archived_at is not null then 'The record is archived.' end,
    case when records.id is not null and drafts.record_id is null
      then 'There is no draft to publish.' end
  ], null)
  from (select p_record_id as requested_id) as requested
  left join public.catalogue_records as records on records.id = requested.requested_id
  left join public.catalogue_drafts as drafts on drafts.record_id = records.id;
$function$;

comment on function public.catalogue_publish_blockers(bigint) is
  'Reasons the current mutable draft cannot be published.';

create table public.catalogue_source_documents (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  source_id bigint not null references public.catalogue_sources (id),
  record_id bigint not null references public.catalogue_records (id) on delete cascade,
  academic_year_id bigint not null references public.academic_years (id),
  kind text not null,
  external_key text not null,
  canonical_url text not null,
  media_type text not null default 'text/html',
  content_sha256 text not null,
  http_status integer,
  http_etag text,
  source_last_modified timestamptz,
  fetched_at timestamptz not null,
  byte_size integer,
  storage_bucket text,
  storage_path text,
  created_at timestamptz not null default now(),
  constraint catalogue_source_documents_public_id_unique unique (public_id),
  constraint catalogue_source_documents_id_record_unique unique (id, record_id),
  constraint catalogue_source_documents_identity_unique
    unique (source_id, record_id, content_sha256),
  constraint catalogue_source_documents_record_year_fkey
    foreign key (record_id, academic_year_id)
    references public.catalogue_records (id, academic_year_id) on delete cascade,
  constraint catalogue_source_documents_record_kind_fkey
    foreign key (record_id, kind)
    references public.catalogue_records (id, kind) on delete cascade,
  constraint catalogue_source_documents_kind_check check (
    kind in ('course', 'programme', 'major', 'minor', 'specialisation')
  ),
  constraint catalogue_source_documents_sha_check
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint catalogue_source_documents_size_check
    check (byte_size is null or byte_size >= 0),
  constraint catalogue_source_documents_storage_check check (
    (storage_bucket is null) = (storage_path is null)
  )
);

create index catalogue_source_documents_record_idx
  on public.catalogue_source_documents (record_id, fetched_at desc);

create trigger catalogue_source_documents_reject_mutation
before update or delete on public.catalogue_source_documents
for each row execute function private.reject_immutable_catalogue_record_mutation();

alter table public.catalogue_versions
  drop constraint catalogue_versions_origin_check,
  drop constraint if exists catalogue_versions_source_page_fkey,
  drop column if exists source_page_id,
  add column source_document_id bigint,
  add column sync_id uuid,
  add constraint catalogue_versions_origin_check
    check (origin in ('source', 'manual')),
  add constraint catalogue_versions_source_document_fkey
    foreign key (source_document_id, record_id)
    references public.catalogue_source_documents (id, record_id);

-- The projection function is SQL text rather than a dependency-tracked
-- expression, so replace its retired source-page field after the clean cutover.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(routines.oid)
  into definition
  from pg_proc as routines
  join pg_namespace as schemas on schemas.oid = routines.pronamespace
  where schemas.nspname = 'private'
    and routines.proname = 'course_version_projection'
    and pg_get_function_identity_arguments(routines.oid) = 'p_version_id bigint';

  definition := replace(
    definition,
    'snapshots.source_page_id,',
    'snapshots.source_document_id,'
  );
  definition := replace(
    definition,
    '''sourcePageId'', snapshot.source_page_id',
    '''sourceDocumentId'', snapshot.source_document_id'
  );
  execute definition;
end;
$migration$;

create table public.catalogue_syncs (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null default gen_random_uuid(),
  record_id bigint not null references public.catalogue_records (id) on delete cascade,
  trigger text not null,
  status text not null default 'queued',
  requested_model text not null references public.import_models (id),
  parser_version text not null,
  prompt_version text not null,
  schema_version text not null,
  previous_source_version_id bigint,
  source_version_id bigint,
  source_document_id bigint,
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  checked_at timestamptz,
  completed_at timestamptz,
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
  constraint catalogue_syncs_public_id_unique unique (public_id),
  constraint catalogue_syncs_previous_source_version_fkey
    foreign key (previous_source_version_id, record_id)
    references public.catalogue_versions (id, record_id),
  constraint catalogue_syncs_source_version_fkey
    foreign key (source_version_id, record_id)
    references public.catalogue_versions (id, record_id),
  constraint catalogue_syncs_source_document_fkey
    foreign key (source_document_id, record_id)
    references public.catalogue_source_documents (id, record_id),
  constraint catalogue_syncs_trigger_check check (trigger in ('manual', 'scheduled')),
  constraint catalogue_syncs_status_check check (
    status in ('queued', 'running', 'unchanged', 'review_required', 'applied', 'failed', 'cancelled')
  ),
  constraint catalogue_syncs_attempts_check check (attempt_count between 0 and 5),
  constraint catalogue_syncs_versions_check check (
    btrim(parser_version) <> '' and btrim(prompt_version) <> '' and btrim(schema_version) <> ''
  )
);

create index catalogue_syncs_record_idx
  on public.catalogue_syncs (record_id, created_at desc);
create index catalogue_syncs_lease_idx
  on public.catalogue_syncs (status, lease_expires_at);
create unique index catalogue_syncs_active_record_idx
  on public.catalogue_syncs (record_id)
  where status in ('queued', 'running');

create trigger catalogue_syncs_set_updated_at
before update on public.catalogue_syncs
for each row execute function private.set_updated_at();

alter table public.catalogue_versions
  add constraint catalogue_versions_sync_fkey
    foreign key (sync_id) references public.catalogue_syncs (id) on delete set null;

alter table public.catalogue_records
  add column latest_source_version_id bigint,
  add column source_checked_at timestamptz,
  add constraint catalogue_records_latest_source_version_fkey
    foreign key (latest_source_version_id, id)
    references public.catalogue_versions (id, record_id);

alter table public.catalogue_version_provenance
  add column source_document_id bigint references public.catalogue_source_documents (id);

create table public.catalogue_sync_stages (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.catalogue_syncs (id) on delete cascade,
  stage_name text not null,
  attempt_number integer not null,
  status text not null default 'running',
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  error_code text,
  error_summary text,
  constraint catalogue_sync_stages_unique unique (sync_id, stage_name, attempt_number),
  constraint catalogue_sync_stages_name_check check (
    stage_name in (
      'source_fetch', 'html_capture', 'markdown_normalise', 'model_input_prepare',
      'deterministic_extract', 'model_extract', 'schema_validate', 'domain_validate',
      'content_project', 'source_version_persist'
    )
  ),
  constraint catalogue_sync_stages_status_check
    check (status in ('running', 'completed', 'failed'))
);

create index catalogue_sync_stages_sync_idx
  on public.catalogue_sync_stages (sync_id, started_at);

create table public.catalogue_sync_artifacts (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.catalogue_syncs (id) on delete cascade,
  stage_id uuid not null references public.catalogue_sync_stages (id) on delete cascade,
  kind text not null,
  attempt_number integer not null,
  media_type text not null,
  content_sha256 text not null,
  byte_size integer not null,
  storage_bucket text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint catalogue_sync_artifacts_kind_check check (
    kind in (
      'raw_html', 'normalised_markdown', 'model_input', 'deterministic_output',
      'model_request', 'model_response', 'validated_json', 'validation_report',
      'content_projection'
    )
  ),
  constraint catalogue_sync_artifacts_sha_check check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint catalogue_sync_artifacts_size_check check (byte_size >= 0)
);

create index catalogue_sync_artifacts_sync_idx
  on public.catalogue_sync_artifacts (sync_id, created_at);

create trigger catalogue_sync_artifacts_reject_mutation
before update on public.catalogue_sync_artifacts
for each row execute function private.reject_immutable_catalogue_record_mutation();

create table public.catalogue_extractions (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.catalogue_syncs (id) on delete cascade,
  extraction_number integer not null,
  requested_model text not null,
  resolved_model text,
  fingerprint text not null,
  prompt_version text not null,
  schema_version text not null,
  request_artifact_id uuid not null references public.catalogue_sync_artifacts (id),
  response_artifact_id uuid references public.catalogue_sync_artifacts (id),
  validated_artifact_id uuid references public.catalogue_sync_artifacts (id),
  reused_from_extraction_id uuid references public.catalogue_extractions (id),
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
  constraint catalogue_extractions_sync_number_unique unique (sync_id, extraction_number),
  constraint catalogue_extractions_cost_source_check check (cost_source in ('provider', 'cache', 'unknown')),
  constraint catalogue_extractions_validation_status_check check (validation_status in ('pending', 'valid', 'invalid')),
  constraint catalogue_extractions_fingerprint_check check (fingerprint ~ '^[0-9a-f]{64}$')
);

create index catalogue_extractions_fingerprint_idx
  on public.catalogue_extractions (fingerprint, validation_status);

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
    and (to_jsonb(new) - 'sync_id' - 'created_by')
      = (to_jsonb(old) - 'sync_id' - 'created_by')
    and (new.sync_id is null or new.sync_id = old.sync_id)
    and (new.created_by is null or new.created_by = old.created_by)
  then
    return new;
  end if;
  raise exception 'Catalogue versions are immutable; create a new version instead.'
    using errcode = '55000';
end;
$function$;

alter table public.catalogue_change_events
  drop constraint catalogue_change_events_kind_check,
  add constraint catalogue_change_events_kind_check
    check (event_kind in (
      'edit', 'publish', 'unpublish', 'discard', 'restore',
      'source_draft_created', 'source_checked', 'source_changed', 'sync_failed'
    ));

alter table public.notifications
  drop constraint notifications_kind_check,
  add constraint notifications_kind_check
    check (kind in ('key_date', 'plan_risk', 'published_change'));

alter table public.catalogue_source_documents enable row level security;
alter table public.catalogue_syncs enable row level security;
alter table public.catalogue_sync_stages enable row level security;
alter table public.catalogue_sync_artifacts enable row level security;
alter table public.catalogue_extractions enable row level security;

create policy catalogue_source_documents_admin_read on public.catalogue_source_documents
for select to authenticated using ((select private.has_permission('imports.manage')));
create policy catalogue_syncs_admin_read on public.catalogue_syncs
for select to authenticated using ((select private.has_permission('imports.manage')));
create policy catalogue_sync_stages_admin_read on public.catalogue_sync_stages
for select to authenticated using ((select private.has_permission('imports.manage')));
create policy catalogue_sync_artifacts_admin_read on public.catalogue_sync_artifacts
for select to authenticated using ((select private.has_permission('imports.manage')));
create policy catalogue_extractions_admin_read on public.catalogue_extractions
for select to authenticated using ((select private.has_permission('imports.manage')));

grant select on table public.catalogue_source_documents, public.catalogue_syncs,
  public.catalogue_sync_stages, public.catalogue_sync_artifacts, public.catalogue_extractions
to authenticated;
grant select, insert, update, delete on table public.catalogue_source_documents,
  public.catalogue_syncs, public.catalogue_sync_stages, public.catalogue_sync_artifacts,
  public.catalogue_extractions to service_role;
grant usage, select on sequence public.catalogue_source_documents_id_seq to service_role;

create or replace function public.start_catalogue_sync(
  p_record_id bigint,
  p_trigger text,
  p_requested_model text,
  p_parser_version text,
  p_prompt_version text,
  p_schema_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  user_id uuid := (select auth.uid());
  created_sync_id uuid;
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Synchronising catalogue records requires the imports.manage permission.';
  end if;
  if p_trigger not in ('manual', 'scheduled') then
    raise exception using errcode = '22023', message = 'The sync trigger is not recognised.';
  end if;
  if not exists (select 1 from public.catalogue_records where id = p_record_id and archived_at is null) then
    raise exception using errcode = 'P0002', message = 'The catalogue record is not available for synchronisation.';
  end if;
  if not exists (select 1 from public.import_models where id = p_requested_model and enabled) then
    raise exception using errcode = '22023', message = 'Choose an enabled extraction model.';
  end if;

  insert into public.catalogue_syncs (
    record_id, trigger, requested_model, parser_version, prompt_version,
    schema_version, requested_by, previous_source_version_id
  )
  select p_record_id, p_trigger, p_requested_model, p_parser_version,
    p_prompt_version, p_schema_version, user_id, latest_source_version_id
  from public.catalogue_records where id = p_record_id
  returning id into created_sync_id;
  return created_sync_id;
exception
  when unique_violation then
    raise exception using errcode = '55000', message = 'This record is already syncing from ANU.';
end;
$function$;

revoke all on function public.start_catalogue_sync(bigint, text, text, text, text, text) from public, anon;
grant execute on function public.start_catalogue_sync(bigint, text, text, text, text, text) to authenticated;

create or replace function public.cancel_catalogue_sync(p_sync_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Cancelling a catalogue sync requires the imports.manage permission.';
  end if;
  update public.catalogue_syncs
  set status = 'cancelled', worker_id = null, lease_expires_at = null,
      completed_at = now(), error_code = null, error_message = null
  where id = p_sync_id and status in ('queued', 'running');
  return found;
end;
$function$;

revoke all on function public.cancel_catalogue_sync(uuid) from public, anon;
grant execute on function public.cancel_catalogue_sync(uuid) to authenticated;

create or replace function private.recover_stale_catalogue_syncs()
returns integer
language plpgsql
set search_path = ''
as $function$
declare recovered integer;
begin
  with changed as (
    update public.catalogue_syncs
    set status = case when attempt_count >= 5 then 'failed' else 'queued' end,
        worker_id = null, lease_expires_at = null,
        error_code = case when attempt_count >= 5 then 'LEASE_EXPIRED' else error_code end,
        error_message = case when attempt_count >= 5
          then 'The worker lease expired after the final attempt.' else error_message end,
        completed_at = case when attempt_count >= 5 then now() else null end
    where status = 'running' and lease_expires_at < now()
    returning record_id, requested_by, status
  ), recorded_failures as (
    insert into public.catalogue_change_events (
      record_id, event_kind, origin, actor_id
    )
    select record_id, 'sync_failed', 'source', requested_by
    from changed where status = 'failed'
    returning id
  )
  select count(*) into recovered from changed;
  return recovered;
end;
$function$;

revoke all on function private.recover_stale_catalogue_syncs() from public, anon, authenticated;

comment on table public.catalogue_syncs is
  'One independently queued ANU source check for one annual catalogue record.';
comment on table public.catalogue_source_documents is
  'Immutable source material fetched from ANU for a record sync.';
comment on table public.catalogue_sync_stages is
  'Developer-facing execution diagnostics for catalogue synchronisation.';
comment on table public.catalogue_sync_artifacts is
  'Immutable technical inputs and outputs retained for a catalogue sync.';

commit;
