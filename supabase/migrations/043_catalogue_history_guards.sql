-- Catalogue history that the architecture calls immutable is now immutable in
-- the database, not only in application code.
--
-- 1. A child row cannot move between versions. The sealed-version guard looked
--    only at the new version, so a sealed version's rows could be moved out
--    to an unsealed one, silently changing published content.
-- 2. Publications record when a version became public and when it stopped.
--    Closing the open interval is the only change allowed; nothing is deleted.
-- 3. Change events and field changes are append-only.
-- 4. TRUNCATE skips row triggers, so it is refused on the guarded history and
--    revoked from the API roles everywhere in public.
-- 5. A programme, major, minor or specialisation year cannot be archived while
--    a plan selects it, matching the existing rule for planned courses.
-- 6. course_attempts carried two identical unique constraints.

-- 1. Rows stay with their version --------------------------------------------

create or replace function private.guard_snapshot_child_mutation() returns trigger
    language plpgsql
    set search_path to ''
    as $$
declare
  target_snapshot_id bigint := case
    when tg_op = 'DELETE' then old.version_id
    else new.version_id
  end;
  snapshot_is_sealed boolean;
begin
  if tg_op = 'UPDATE' and new.version_id is distinct from old.version_id then
    raise exception
      'catalogue snapshot rows cannot move from snapshot % to %',
      old.version_id, new.version_id
      using errcode = '55000';
  end if;

  select snapshots.sealed_at is not null
  into snapshot_is_sealed
  from public.catalogue_versions as snapshots
  join public.catalogue_records as item_years
    on item_years.id = snapshots.record_id
  where snapshots.id = target_snapshot_id
  for update of item_years;

  if coalesce(snapshot_is_sealed, false) then
    raise exception
      'catalogue snapshot % is sealed; create a new snapshot instead',
      target_snapshot_id
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 2. Publication intervals only close ----------------------------------------

create function private.guard_catalogue_publication_history() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if tg_op = 'UPDATE'
    and old.unpublished_at is null
    and new.unpublished_at is not null
    and (new.id, new.record_id, new.version_id, new.published_at, new.published_by)
      is not distinct from
      (old.id, old.record_id, old.version_id, old.published_at, old.published_by)
  then
    return new;
  end if;

  raise exception
    'catalogue publications are history; only an open publication can be closed'
    using errcode = '55000';
end;
$$;

create trigger catalogue_publications_guard_history
  before update or delete on public.catalogue_publications
  for each row execute function private.guard_catalogue_publication_history();

-- 3. The change log is append-only --------------------------------------------

create trigger catalogue_change_events_reject_mutation
  before update or delete on public.catalogue_change_events
  for each row execute function private.reject_immutable_catalogue_record_mutation();

create trigger catalogue_field_changes_reject_mutation
  before update or delete on public.catalogue_field_changes
  for each row execute function private.reject_immutable_catalogue_record_mutation();

-- 4. No truncation of history ---------------------------------------------------

create function private.reject_catalogue_history_truncate() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  raise exception '% is catalogue history and cannot be truncated', tg_table_name
    using errcode = '55000';
end;
$$;

create trigger catalogue_versions_reject_truncate
  before truncate on public.catalogue_versions
  for each statement execute function private.reject_catalogue_history_truncate();

create trigger catalogue_publications_reject_truncate
  before truncate on public.catalogue_publications
  for each statement execute function private.reject_catalogue_history_truncate();

create trigger catalogue_change_events_reject_truncate
  before truncate on public.catalogue_change_events
  for each statement execute function private.reject_catalogue_history_truncate();

create trigger catalogue_field_changes_reject_truncate
  before truncate on public.catalogue_field_changes
  for each statement execute function private.reject_catalogue_history_truncate();

revoke truncate on all tables in schema public from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated, service_role;

revoke all on function private.guard_catalogue_publication_history() from public;
revoke all on function private.reject_catalogue_history_truncate() from public;

-- 5. Selected structures block archival ------------------------------------------

create or replace function private.guard_archived_catalogue_item_year() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if old.archived_at is not null and new is distinct from old then
    raise exception 'Archived catalogue years are immutable.' using errcode = '55000';
  end if;
  if new.archived_at is not null
    and new.published_version_id is distinct from old.published_version_id
  then
    raise exception 'Archival cannot change the published version.' using errcode = '55000';
  end if;
  if new.archived_at is not null and (
    exists (
      select 1
      from public.plan_items
      where plan_items.catalogue_record_id = old.id
    )
    or exists (
      select 1
      from public.plan_structures
      where plan_structures.catalogue_record_id = old.id
    )
  ) then
    raise exception
      'This catalogue year cannot be archived while it is referenced by a student plan.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

-- 6. One uniqueness rule per attempt -----------------------------------------------

alter table public.course_attempts
  drop constraint course_attempts_owner_snapshot_period_unique;
