begin;

create table public.catalogue_provider_controls (
  provider text primary key check (provider = 'openrouter'),
  paused boolean default false not null,
  revision integer default 0 not null check (revision >= 0),
  paused_at timestamptz,
  pause_reason text check (pause_reason in ('key_limit', 'credits', 'authentication', 'configuration')),
  error_message text,
  source_sync_id uuid references public.catalogue_syncs(id) on delete set null,
  resumed_at timestamptz,
  resumed_by uuid references auth.users(id) on delete set null,
  constraint catalogue_provider_controls_pause_check
    check (not paused or (paused_at is not null and pause_reason is not null and error_message is not null))
);
insert into public.catalogue_provider_controls (provider) values ('openrouter');
alter table public.catalogue_provider_controls enable row level security;
revoke all on public.catalogue_provider_controls from public, anon, authenticated, service_role;
grant select on public.catalogue_provider_controls to authenticated;
grant select, update on public.catalogue_provider_controls to service_role;
create policy catalogue_provider_controls_admin_read
  on public.catalogue_provider_controls for select to authenticated
  using ((select private.has_permission('imports.manage')));

alter table public.catalogue_syncs
  add column retry_count integer default 0 not null check (retry_count >= 0 and retry_count <= 5),
  add column dispatch_generation integer default 0 not null check (dispatch_generation >= 0);
alter table public.catalogue_syncs drop constraint catalogue_syncs_attempts_check;
alter table public.catalogue_syncs add constraint catalogue_syncs_attempts_check check (attempt_count >= 0);
update public.catalogue_syncs set retry_count = least(attempt_count, 5);
alter table public.catalogue_syncs drop constraint catalogue_syncs_status_check;
alter table public.catalogue_syncs add constraint catalogue_syncs_status_check
  check (status in ('queued', 'running', 'paused', 'unchanged', 'review_required', 'applied', 'failed', 'cancelled'));
drop index public.catalogue_syncs_active_record_idx;
create unique index catalogue_syncs_active_record_idx on public.catalogue_syncs(record_id)
  where status in ('queued', 'running', 'paused');

create function public.resume_catalogue_provider(
  p_expected_revision integer, p_resume boolean, p_limit integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  control public.catalogue_provider_controls%rowtype;
  resumed jsonb;
  remaining integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Resuming catalogue imports requires the imports.manage permission.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 25 or p_resume is null then
    raise exception using errcode = '22023', message = 'The recovery batch is invalid.';
  end if;
  select * into control from public.catalogue_provider_controls
    where provider = 'openrouter' for update;
  if p_expected_revision is null or control.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'The provider state changed. Refresh before resuming.';
  end if;
  if p_resume then
    if not control.paused then
      raise exception using errcode = '55000', message = 'The provider is already available. Recover the remaining paused syncs.';
    end if;
    update public.catalogue_provider_controls
      set paused = false, revision = revision + 1, resumed_at = now(), resumed_by = (select auth.uid())
      where provider = 'openrouter'
      returning * into control;
  elsif control.paused then
    raise exception using errcode = '55000', message = 'The provider is paused again. Resolve its error before resuming.';
  end if;

  with selected as (
    select id from public.catalogue_syncs
    where status = 'paused'
      or (status = 'queued' and dispatch_generation > 0 and dispatched_at is null)
    order by requested_at, id limit p_limit for update skip locked
  ), recovered as (
    update public.catalogue_syncs as syncs
    set status = 'queued', retry_count = 0, dispatch_generation = dispatch_generation + 1,
        queue_message_id = null, dispatched_at = null, worker_id = null, lease_expires_at = null,
        completed_at = null, error_code = null, error_message = null
    from selected where syncs.id = selected.id
    returning syncs.id, syncs.dispatch_generation
  ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'generation', dispatch_generation)), '[]'::jsonb)
    into resumed from recovered;

  select count(*)::integer into remaining from public.catalogue_syncs
    where status = 'paused';
  return jsonb_build_object('syncs', resumed, 'remainingPaused', remaining, 'revision', control.revision);
end;
$$;
revoke all on function public.resume_catalogue_provider(integer, boolean, integer) from public, anon;
grant execute on function public.resume_catalogue_provider(integer, boolean, integer) to authenticated, service_role;

create or replace function public.cancel_catalogue_sync(p_sync_id uuid) returns boolean
    language plpgsql security definer
    set search_path to ''
    as $$
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
  where id = p_sync_id and status in ('queued', 'running', 'paused');
  return found;
end;
$$;

create or replace function public.start_catalogue_sync(p_record_id bigint, p_trigger text, p_requested_model text, p_parser_version text, p_prompt_version text, p_schema_version text) returns uuid
    language plpgsql security definer
    set search_path to ''
    as $$
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
  if exists (select 1 from public.catalogue_provider_controls where provider = 'openrouter' and paused) then
    raise exception using errcode = '55000', message = 'Catalogue imports are paused. Resolve the provider issue and resume them in Activity.';
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
    raise exception using errcode = '55000', message = 'This record already has an unfinished ANU sync.';
end;
$$;

create or replace function private.recover_stale_catalogue_syncs() returns integer
    language plpgsql
    set search_path to ''
    as $$
declare recovered integer;
begin
  with changed as (
    update public.catalogue_syncs
    set status = case when retry_count >= 5 then 'failed' else 'queued' end,
        worker_id = null, lease_expires_at = null,
        error_code = case when retry_count >= 5 then 'LEASE_EXPIRED' else error_code end,
        error_message = case when retry_count >= 5
          then 'The worker lease expired after the final attempt.' else error_message end,
        completed_at = case when retry_count >= 5 then now() else null end
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
$$;

commit;
