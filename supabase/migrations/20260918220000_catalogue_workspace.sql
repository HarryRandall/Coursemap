begin;

-- Workspace support: administrators preview any snapshot they may read and
-- discard a draft they no longer want.

-- The student-facing projection of a snapshot for administrators, including
-- drafts and history. Only course snapshots have a projection today.
create or replace function public.admin_snapshot_projection(p_snapshot_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  snapshot_kind text;
begin
  if not private.can_manage_catalogue() then
    raise exception using errcode = '42501', message = 'Catalogue permission is required.';
  end if;
  select kind into snapshot_kind from public.catalogue_snapshots where id = p_snapshot_id;
  if snapshot_kind is null then
    raise exception using errcode = 'P0002', message = 'The snapshot does not exist.';
  end if;
  if snapshot_kind <> 'course' then
    return null;
  end if;
  return private.course_snapshot_projection(p_snapshot_id)
    || jsonb_build_object('snapshotId', p_snapshot_id);
end;
$function$;

revoke all on function public.admin_snapshot_projection(bigint) from public, anon;
grant execute on function public.admin_snapshot_projection(bigint) to authenticated;

-- Clears the draft pointer. The snapshot stays in history and can be restored.
create or replace function public.discard_catalogue_draft(p_item_year_id bigint)
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
    raise exception using errcode = '42501', message = 'Editing requires the catalogue.write permission.';
  end if;
  update public.catalogue_item_years
  set draft_snapshot_id = null
  where id = p_item_year_id and draft_snapshot_id is not null;
  if not found then
    raise exception using errcode = '55000', message = 'There is no draft to discard.';
  end if;
end;
$function$;

revoke all on function public.discard_catalogue_draft(bigint) from public, anon;
grant execute on function public.discard_catalogue_draft(bigint) to authenticated;

commit;
