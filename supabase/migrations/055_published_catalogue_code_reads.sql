-- Published catalogue codes do not need editorial or private-plan checks.
-- Keep this as a separate statement: planning the full SQL expression for
-- every code was enough to exceed the API statement timeout on cold reads.
create or replace function private.can_read_catalogue_item(p_item_id bigint)
  returns boolean
  language plpgsql stable security definer
  set search_path to ''
  as $$
begin
  if exists (
    select 1
    from public.catalogue_records as records
    where records.code_id = p_item_id
      and records.published_version_id is not null
      and records.archived_at is null
  ) then
    return true;
  end if;

  return private.can_read_catalogue_drafts()
    or exists (
      select 1
      from public.requirement_conditions as conditions
      where conditions.code_id = p_item_id
        and private.is_published_version(conditions.version_id)
    )
    or exists (
      select 1
      from public.requirement_condition_options as options
      where options.code_id = p_item_id
        and private.is_published_version(options.version_id)
    )
    or exists (
      select 1
      from public.requirement_item_references as item_references
      where item_references.code_id = p_item_id
        and private.is_published_version(item_references.version_id)
    )
    or exists (
      select 1
      from public.course_related_courses as related
      where related.related_course_id = p_item_id
        and private.is_published_version(related.version_id)
    )
    or exists (
      select 1
      from public.course_attempts as attempts
      join public.catalogue_versions as versions
        on versions.id = attempts.catalogue_version_id
      join public.catalogue_records as records on records.id = versions.record_id
      where records.code_id = p_item_id
        and attempts.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.plan_items
      join public.catalogue_records as records
        on records.id = plan_items.catalogue_record_id
      where records.code_id = p_item_id
        and plan_items.owner_id = (select auth.uid())
    );
end;
$$;

revoke all on function private.can_read_catalogue_item(bigint) from public;
grant execute on function private.can_read_catalogue_item(bigint) to anon, authenticated;
