-- Keep page-sized administration reads in the database. The directory has the
-- same imports.manage boundary as its page, including unpublished records.
create function public.admin_catalogue_directory_page(
  p_kind text, p_academic_year smallint, p_query text default '',
  p_state text default null, p_page integer default 1
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission('imports.manage') then
    raise exception 'Catalogue operations permission is required.' using errcode = '42501';
  end if;
  if p_kind not in ('course', 'programme', 'major', 'minor', 'specialisation') then
    raise exception 'A valid catalogue kind is required.' using errcode = '22023';
  end if;
  if p_state is not null and p_state not in ('sync_failed', 'paused', 'delisted', 'syncing', 'changes_available', 'draft', 'published', 'unpublished') then
    raise exception 'A valid catalogue state is required.' using errcode = '22023';
  end if;
  return (
    with selected_year as (
      select id from public.academic_years where year = p_academic_year
    ), listings as (
      select listing.code, listing.title, listing.summary, listing.code_id,
        listing.is_current, listing.last_seen_at
      from public.catalogue_listings as listing
      where listing.academic_year_id = (select id from selected_year) and listing.kind = p_kind
      union all
      select codes.code, null::text, '{}'::jsonb, records.code_id, null::boolean, null::timestamptz
      from public.catalogue_records as records
      join public.catalogue_codes as codes on codes.id = records.code_id
      where records.academic_year_id = (select id from selected_year) and records.kind = p_kind
        and not exists (
          select 1 from public.catalogue_listings as listing
          where listing.academic_year_id = records.academic_year_id and listing.kind = p_kind
            and listing.code_id = records.code_id
        )
    ), matched as (
      select listings.*, records.id as record_id, records.published_version_id,
        records.published_version_id is not null and records.archived_at is null as is_published,
        drafts.record_id is not null as has_draft, drafts.revision as draft_revision,
        drafts.content_hash as draft_hash, sync.id as sync_id, sync.status as sync_status,
        sync.error_message, sync.completed_at, changes.open_count, changes.conflict_count
      from listings
      left join public.catalogue_records as records
        on records.code_id = listings.code_id and records.academic_year_id = (select id from selected_year)
        and records.kind = p_kind
      left join public.catalogue_drafts as drafts on drafts.record_id = records.id
      left join lateral (
        select id, status, error_message, completed_at
        from public.catalogue_syncs where record_id = records.id
        order by created_at desc, id desc limit 1
      ) as sync on true
      left join lateral (
        select count(*)::integer as open_count,
          count(*) filter (where classification = 'conflict')::integer as conflict_count
        from public.catalogue_sync_changes
        where record_id = records.id and classification in ('source_change', 'conflict')
          and decision is null and superseded_at is null
      ) as changes on true
      where not exists (
        select 1 from regexp_split_to_table(upper(coalesce(p_query, '')), '[^A-Z0-9]+') as word
        where word <> '' and position(word in regexp_replace(upper(listings.code || ' ' || coalesce(listings.title, '')), '[^A-Z0-9]+', ' ', 'g')) = 0
      )
    ), states as (
      select matched.*, case
        when sync_status in ('queued', 'running') then 'syncing'
        when sync_status = 'paused' then 'paused'
        when sync_status = 'failed' then 'sync_failed'
        when sync_id is null then 'never_synced'
        when open_count > 0 then 'changes_available'
        else 'up_to_date' end as source_state,
        case
        when sync_status = 'failed' then 'sync_failed'
        when sync_status = 'paused' then 'paused'
        when is_current = false then 'delisted'
        when sync_status in ('queued', 'running') then 'syncing'
        when sync_id is not null and open_count > 0 then 'changes_available'
        when has_draft then 'draft'
        when is_published then 'published'
        else 'unpublished' end as record_state
      from matched
    ), filtered as materialized (
      select * from states where p_state is null
        or (p_state = 'published' and is_published)
        or (p_state <> 'published' and record_state = p_state)
    ), pagination as (
      select count(*)::integer as total,
        greatest(1, least(coalesce(p_page, 1), greatest(1, ceil(count(*)::numeric / 50)::integer))) as page
      from filtered
    ), selected as (
      select filtered.* from filtered order by code
      limit 50 offset ((select page from pagination) - 1) * 50
    )
    select jsonb_build_object(
      'years', coalesce((select jsonb_agg(year order by year desc) from public.academic_years where year between 2020 and 2030), '[]'::jsonb),
      'status', coalesce((select jsonb_build_object('state', status, 'refreshedAt', refreshed_at, 'message', message, 'entryCount', entry_count)
        from public.catalogue_discovery_statuses where academic_year_id = (select id from selected_year) and kind = p_kind),
        '{"state":"never","refreshedAt":null,"message":null,"entryCount":0}'::jsonb),
      'total', pagination.total, 'page', pagination.page,
      'records', coalesce((select jsonb_agg(jsonb_build_object(
        'code', selected.code, 'title', selected.title, 'summary', coalesce(selected.summary, '{}'::jsonb),
        'recordId', selected.record_id, 'hasDraft', selected.has_draft, 'draftRevision', selected.draft_revision,
        'draftHash', selected.draft_hash, 'publishedHash', versions.content_hash,
        'hasPublication', selected.published_version_id is not null,
        'isPublished', selected.is_published, 'isListedByAnu', selected.is_current, 'lastSeenAt', selected.last_seen_at,
        'sourceState', selected.source_state, 'openChangeCount', selected.open_count, 'conflictCount', selected.conflict_count,
        'latestSync', case when selected.sync_id is not null then jsonb_build_object('id', selected.sync_id, 'status', selected.sync_status, 'errorMessage', selected.error_message, 'completedAt', selected.completed_at) end
      ) order by selected.code) from selected left join public.catalogue_versions as versions on versions.id = selected.published_version_id), '[]'::jsonb)
    ) from pagination
  );
end;
$$;

-- Invoker security preserves catalogue RLS for a student-record reader who
-- does not also hold permission to view unpublished catalogue records.
create function public.admin_top_courses(p_limit integer default 6)
returns table(code text, students bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.has_permission('students.read') then
    raise exception 'Student records permission is required.' using errcode = '42501';
  end if;
  return query
    select codes.code, count(distinct items.owner_id) as students
    from public.plan_items as items
    join public.catalogue_records as records on records.id = items.catalogue_record_id
    join public.catalogue_codes as codes on codes.id = records.code_id
    group by codes.code order by count(distinct items.owner_id) desc, min(items.id::text)
    limit greatest(1, least(coalesce(p_limit, 6), 50));
end;
$$;

revoke all on function public.admin_catalogue_directory_page(text, smallint, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_top_courses(integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_catalogue_directory_page(text, smallint, text, text, integer) to authenticated;
grant execute on function public.admin_top_courses(integer) to authenticated;
