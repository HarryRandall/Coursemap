begin;

-- Review of import candidates. Each target records the differences between
-- its baseline and candidate snapshots as changes, and the parser's review
-- items as flags. Applying accepted changes produces a new draft; publishing
-- moves the draft pointer once no blocking flag is open.

create table public.catalogue_import_changes (
  id bigint generated always as identity primary key,
  target_id uuid not null,
  entry_kind text not null,
  field_path text not null,
  old_value jsonb,
  new_value jsonb,
  severity text,
  is_blocking boolean not null default false,
  issue_code text,
  summary text,
  source_locator text,
  source_excerpt text,
  status text not null default 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint catalogue_import_changes_target_fkey
    foreign key (target_id) references public.catalogue_import_targets (id) on delete cascade,
  constraint catalogue_import_changes_resolved_by_fkey
    foreign key (resolved_by) references auth.users (id) on delete set null,
  constraint catalogue_import_changes_entry_kind_check check (entry_kind in ('change', 'flag')),
  constraint catalogue_import_changes_field_path_check check (btrim(field_path) <> ''),
  constraint catalogue_import_changes_shape_check check (
    (entry_kind = 'change' and severity is null and issue_code is null)
    or (entry_kind = 'flag' and old_value is null and new_value is null
        and severity in ('warning', 'error') and issue_code is not null)
  ),
  constraint catalogue_import_changes_status_check check (
    (entry_kind = 'change' and status in ('open', 'accepted', 'rejected'))
    or (entry_kind = 'flag' and status in ('open', 'acknowledged'))
  ),
  constraint catalogue_import_changes_resolution_check check (
    (status = 'open' and resolved_at is null)
    or (status <> 'open' and resolved_at is not null)
  )
);

create index catalogue_import_changes_target_idx
  on public.catalogue_import_changes (target_id, entry_kind, position);

create index catalogue_import_changes_open_blocking_idx
  on public.catalogue_import_changes (target_id)
  where entry_kind = 'flag' and is_blocking and status = 'open';

alter table public.catalogue_import_changes enable row level security;

create policy catalogue_import_changes_import_admin_read
  on public.catalogue_import_changes for select to authenticated
  using ((select private.has_permission('imports.manage')));

grant select on table public.catalogue_import_changes to authenticated;
grant select, insert, update, delete on table public.catalogue_import_changes to service_role;

-- Applying a candidate records which snapshot the review produced.
alter table public.catalogue_import_targets
  add column applied_snapshot_id bigint,
  add column applied_at timestamptz,
  add constraint catalogue_import_targets_applied_fkey
    foreign key (applied_snapshot_id, item_year_id)
    references public.catalogue_snapshots (id, item_year_id);

-- Resolution ---------------------------------------------------------------------------

-- Accepts or rejects a change, or acknowledges a flag. Acknowledging a
-- blocking flag requires a note explaining why publication may proceed.
create or replace function public.resolve_catalogue_import_change(
  p_change_id bigint,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  user_id uuid := (select auth.uid());
  entry record;
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Reviewing imports requires the imports.manage permission.';
  end if;

  select changes.*, targets.status as target_status, targets.applied_at
  into entry
  from public.catalogue_import_changes as changes
  join public.catalogue_import_targets as targets on targets.id = changes.target_id
  where changes.id = p_change_id
  for update of changes;

  if entry.id is null then
    raise exception using errcode = 'P0002', message = 'The review entry no longer exists.';
  end if;
  if entry.entry_kind = 'change' and entry.applied_at is not null then
    raise exception using errcode = '55000', message = 'This review has already been applied.';
  end if;
  if entry.entry_kind = 'change' and p_status not in ('open', 'accepted', 'rejected') then
    raise exception using errcode = '22023', message = 'A change is open, accepted or rejected.';
  end if;
  if entry.entry_kind = 'flag' and p_status not in ('open', 'acknowledged') then
    raise exception using errcode = '22023', message = 'A flag is open or acknowledged.';
  end if;
  if entry.entry_kind = 'flag' and entry.is_blocking and p_status = 'acknowledged'
     and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception using errcode = '22023', message = 'Acknowledging a blocking flag needs a note.';
  end if;

  update public.catalogue_import_changes
  set status = p_status,
      resolved_by = case when p_status = 'open' then null else user_id end,
      resolved_at = case when p_status = 'open' then null else now() end,
      resolution_note = case when p_status = 'open' then null else nullif(btrim(coalesce(p_note, '')), '') end
  where id = p_change_id;
end;
$function$;

revoke all on function public.resolve_catalogue_import_change(bigint, text, text) from public, anon;
grant execute on function public.resolve_catalogue_import_change(bigint, text, text) to authenticated;

-- Publication gate ---------------------------------------------------------------------

-- Reasons the draft of an item year cannot be published, empty when it can.
create or replace function public.catalogue_publish_blockers(p_item_year_id bigint)
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  with item_year as (
    select * from public.catalogue_item_years where id = p_item_year_id
  ),
  draft as (
    select snapshots.* from public.catalogue_snapshots as snapshots
    join item_year on item_year.draft_snapshot_id = snapshots.id
  )
  select array_remove(array[
    case when not exists (select 1 from item_year) then 'The record does not exist.' end,
    case when exists (select 1 from item_year where archived_at is not null) then 'The record is archived.' end,
    case when exists (select 1 from item_year where draft_snapshot_id is null) then 'There is no draft to publish.' end,
    case when exists (
      select 1 from item_year where draft_snapshot_id is not null
        and draft_snapshot_id = published_snapshot_id
    ) then 'The draft is already published.' end,
    case when exists (
      select 1 from draft
      join public.catalogue_import_changes as changes on changes.target_id = draft.import_target_id
      where changes.entry_kind = 'flag' and changes.is_blocking and changes.status = 'open'
    ) then 'A blocking flag on the draft is still open.' end,
    case when exists (
      select 1 from draft
      join public.catalogue_import_changes as changes on changes.target_id = draft.import_target_id
      where changes.entry_kind = 'change' and changes.status = 'open'
    ) then 'The import review still has open changes.' end
  ], null);
$function$;

revoke all on function public.catalogue_publish_blockers(bigint) from public, anon;
grant execute on function public.catalogue_publish_blockers(bigint) to authenticated;

create or replace function public.publish_catalogue_snapshot(p_item_year_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  blockers text[];
  draft_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('catalogue.write') then
    raise exception using errcode = '42501', message = 'Publishing requires the catalogue.write permission.';
  end if;

  perform 1 from public.catalogue_item_years where id = p_item_year_id for update;
  blockers := public.catalogue_publish_blockers(p_item_year_id);
  if cardinality(blockers) > 0 then
    raise exception using errcode = '55000', message = array_to_string(blockers, ' ');
  end if;

  update public.catalogue_item_years
  set published_snapshot_id = draft_snapshot_id
  where id = p_item_year_id
  returning published_snapshot_id into draft_id;
  return draft_id;
end;
$function$;

revoke all on function public.publish_catalogue_snapshot(bigint) from public, anon;
grant execute on function public.publish_catalogue_snapshot(bigint) to authenticated;

-- Withdraws the published snapshot; the draft pointer is unchanged.
create or replace function public.unpublish_catalogue_item_year(p_item_year_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('catalogue.write') then
    raise exception using errcode = '42501', message = 'Publishing requires the catalogue.write permission.';
  end if;
  update public.catalogue_item_years
  set published_snapshot_id = null
  where id = p_item_year_id and published_snapshot_id is not null;
  if not found then
    raise exception using errcode = '55000', message = 'Nothing is published for this record.';
  end if;
end;
$function$;

revoke all on function public.unpublish_catalogue_item_year(bigint) from public, anon;
grant execute on function public.unpublish_catalogue_item_year(bigint) to authenticated;

commit;
