begin;

-- Stuck targets and phantom items.
--
-- Three related dead ends, all of which needed a superuser or a hand-written
-- statement to escape:
--
-- 1. A target whose worker dies mid-flight goes back to 'queued'. The partial
--    unique index catalogue_import_targets_active_item_year_idx then refuses
--    every further import for that item year, and start_catalogue_import
--    raises "already has an unfinished import". The only sweep that could
--    clear it, private.recover_stale_catalogue_import_targets(), waits thirty
--    minutes, runs only from inside start_catalogue_import (which raises
--    before it helps for a single-record retry) and is revoked from every
--    role. Recovery meant calling cancel_catalogue_import() by hand with an
--    administrator claim set.
-- 2. The lease sweep scans on status and lease_expires_at with no index.
-- 3. private.enforce_catalogue_snapshot_immutability() is a before update or
--    delete trigger that raises unconditionally on DELETE, although its own
--    comment says "Cascading deletes from an item year still pass". They did
--    not. Combined with ensureItemIds() in persist-snapshot.ts creating a
--    placeholder catalogue_items row for any regex-valid code a model emits,
--    one hallucinated code was permanent.

-- 1 and 2: recovery ---------------------------------------------------------------------

create index if not exists catalogue_import_targets_lease_idx
  on public.catalogue_import_targets (status, lease_expires_at);

-- Closes the stage rows a target left running, so a recovered or cancelled
-- target does not show a stage that never ends.
create or replace function private.close_catalogue_import_stages(
  p_target_id uuid,
  p_error_code text,
  p_error_summary text
)
returns void
language sql
set search_path = ''
as $function$
  update public.catalogue_import_stages
  set status = 'failed',
      completed_at = now(),
      error_code = coalesce(error_code, p_error_code),
      error_summary = coalesce(error_summary, p_error_summary)
  where target_id = p_target_id and status = 'running';
$function$;

revoke all on function private.close_catalogue_import_stages(uuid, text, text)
from public, anon, authenticated;

-- Returns one unfinished target to a terminal state so its item year can be
-- imported again. This is the interface path out of a stuck target: it needs
-- no run id, no age and no hand-written SQL.
create or replace function public.release_catalogue_import_target(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_run_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Managing imports requires the imports.manage permission.';
  end if;

  update public.catalogue_import_targets
  set status = 'cancelled',
      worker_id = null,
      lease_expires_at = null,
      lock_version = lock_version + 1,
      error_code = 'RELEASED',
      error_message = 'An administrator released the target so the record could be imported again.',
      completed_at = now()
  where id = p_target_id
    and status in ('queued', 'running')
  returning run_id into affected_run_id;

  if affected_run_id is null then
    raise exception using
      errcode = '55000',
      message = 'That import target is not waiting on a worker.';
  end if;

  perform private.close_catalogue_import_stages(
    p_target_id, 'RELEASED', 'The target was released by an administrator.'
  );
  perform private.refresh_catalogue_import_run(affected_run_id);
end;
$function$;

revoke all on function public.release_catalogue_import_target(uuid) from public, anon;
grant execute on function public.release_catalogue_import_target(uuid) to authenticated;

comment on function public.release_catalogue_import_target(uuid) is
  'Cancels one unfinished import target so its item year stops blocking new imports.';

-- The sweep also closes the stages of whatever it recovers, and is reachable
-- on demand rather than only from start_catalogue_import.
create or replace function private.recover_stale_catalogue_import_targets()
returns integer
language plpgsql
set search_path = ''
as $function$
declare
  recovered integer := 0;
  affected_runs uuid[];
  affected_targets uuid[];
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
      and (lease_expires_at is null or lease_expires_at < now())
    returning id, run_id
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
    returning id, run_id
  )
  select array_agg(distinct run_id), array_agg(id), count(*)
  into affected_runs, affected_targets, recovered
  from (select id, run_id from expired union all select id, run_id from stale) as changed;

  if affected_targets is not null then
    perform private.close_catalogue_import_stages(
      target_id, 'TARGET_RECOVERED', 'The stage was open when the target was recovered.'
    )
    from unnest(affected_targets) as targets(target_id);
  end if;

  if affected_runs is not null then
    perform private.refresh_catalogue_import_run(run_id)
    from unnest(affected_runs) as runs(run_id);
  end if;

  return coalesce(recovered, 0);
end;
$function$;

revoke all on function private.recover_stale_catalogue_import_targets()
from public, anon, authenticated;

-- The same sweep, on demand, for an administrator or a scheduled job.
create or replace function public.recover_catalogue_import_targets()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Managing imports requires the imports.manage permission.';
  end if;
  return private.recover_stale_catalogue_import_targets();
end;
$function$;

revoke all on function public.recover_catalogue_import_targets() from public, anon;
grant execute on function public.recover_catalogue_import_targets() to authenticated;

comment on function public.recover_catalogue_import_targets() is
  'Returns expired leases to the queue and fails targets that were never dispatched.';

-- Cancelling a run also closes the stages its targets left running.
create or replace function public.cancel_catalogue_import(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cancelled integer;
  cancelled_targets uuid[];
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
  select count(*), array_agg(id) into cancelled, cancelled_targets from changed;

  if cancelled_targets is not null then
    perform private.close_catalogue_import_stages(
      target_id, 'CANCELLED', 'The run was stopped while the stage was running.'
    )
    from unnest(cancelled_targets) as targets(target_id);
  end if;

  perform private.refresh_catalogue_import_run(p_run_id);
  return cancelled;
end;
$function$;

revoke all on function public.cancel_catalogue_import(uuid) from public, anon;
grant execute on function public.cancel_catalogue_import(uuid) to authenticated;

-- 3: deleting a catalogue item -----------------------------------------------------------

-- A sealed snapshot is still immutable and still cannot be deleted on its own.
-- What changes: a snapshot that was never sealed may be removed, and a delete
-- that arrives because the owning item year has already gone -- a cascade --
-- passes, which is what the original comment promised. The parent row is
-- deleted before its referencing rows, so its absence identifies the cascade.
create or replace function private.enforce_catalogue_snapshot_immutability()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.sealed_at is null then
      return old;
    end if;
    if not exists (
      select 1 from public.catalogue_item_years where id = old.item_year_id
    ) then
      return old;
    end if;
    raise exception
      'catalogue_snapshots records are immutable; a sealed snapshot cannot be deleted'
      using errcode = '55000';
  end if;
  if old.sealed_at is null
    and new.sealed_at is not null
    and (to_jsonb(new) - 'sealed_at') = (to_jsonb(old) - 'sealed_at')
  then
    return new;
  end if;
  if (to_jsonb(new) - 'import_target_id' - 'created_by')
      = (to_jsonb(old) - 'import_target_id' - 'created_by')
    and (new.import_target_id is null or new.import_target_id = old.import_target_id)
    and (new.created_by is null or new.created_by = old.created_by)
  then
    return new;
  end if;
  raise exception
    'catalogue_snapshots records are immutable; create a new snapshot instead'
    using errcode = '55000';
end;
$function$;

revoke all on function private.enforce_catalogue_snapshot_immutability()
from public, anon, authenticated;

-- Removes a catalogue identity that should never have existed: a code a model
-- invented, or a code typed into the import form by mistake. It refuses once
-- the record carries content anyone has seen -- a sealed snapshot -- or once
-- other catalogue content or a student's plan refers to it. Import targets are
-- removed first because they reference the item year without cascading; their
-- stages, artefact records and review entries follow. Stored artefact objects
-- are not reachable from SQL and stay in the bucket.
create or replace function public.delete_catalogue_item(p_kind text, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  selected_item_id bigint;
  normalised_code text := upper(btrim(coalesce(p_code, '')));
  affected_runs uuid[];
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('catalogue.write') then
    raise exception using errcode = '42501', message = 'Deleting a catalogue record requires the catalogue.write permission.';
  end if;

  select id into selected_item_id
  from public.catalogue_items
  where kind = p_kind and code = normalised_code;

  if selected_item_id is null then
    raise exception using errcode = 'P0002', message = 'That catalogue record does not exist.';
  end if;

  if exists (
    select 1
    from public.catalogue_snapshots as snapshots
    join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
    where item_years.item_id = selected_item_id and snapshots.sealed_at is not null
  ) then
    raise exception using
      errcode = '55000',
      message = 'This record has drafted or published content and cannot be deleted.';
  end if;

  if exists (select 1 from public.requirement_conditions where item_id = selected_item_id)
    or exists (select 1 from public.requirement_condition_options where item_id = selected_item_id)
    or exists (select 1 from public.requirement_item_references where item_id = selected_item_id)
    or exists (select 1 from public.course_related_courses where related_course_id = selected_item_id)
    or exists (select 1 from public.plan_items where course_id = selected_item_id)
    or exists (select 1 from public.course_attempts where course_id = selected_item_id)
  then
    raise exception using
      errcode = '55000',
      message = 'Other catalogue content or a student plan still refers to this code.';
  end if;

  update public.catalogue_directory_entries
  set item_id = null
  where item_id = selected_item_id;

  with removed as (
    delete from public.catalogue_import_targets as targets
    using public.catalogue_item_years as item_years
    where item_years.item_id = selected_item_id
      and targets.item_year_id = item_years.id
    returning targets.run_id
  )
  select array_agg(distinct run_id) into affected_runs from removed;

  delete from public.catalogue_items where id = selected_item_id;

  if affected_runs is not null then
    perform private.refresh_catalogue_import_run(run_id)
    from unnest(affected_runs) as runs(run_id);
  end if;
end;
$function$;

revoke all on function public.delete_catalogue_item(text, text) from public, anon;
grant execute on function public.delete_catalogue_item(text, text) to authenticated;

comment on function public.delete_catalogue_item(text, text) is
  'Removes a catalogue identity that never carried sealed content and is referenced by nothing.';

commit;
