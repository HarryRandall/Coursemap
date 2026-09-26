-- Correct a synced date before it is published.
--
-- An administrator reviewing a sync can edit a date the sync would add, or
-- leave it out. The review's staged events are rewritten in place, and an
-- edited entry is flagged manual so that, once approved, it is kept by later
-- syncs just like a date entered by hand.

create or replace function public.revise_university_calendar_review(
  p_review_id uuid,
  p_event_date date,
  p_title text,
  p_new_event_date date default null,
  p_new_title text default null
) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_review public.university_calendar_reviews;
  v_new_title text := btrim(coalesce(p_new_title, ''));
  v_leave_out boolean := p_new_event_date is null and p_new_title is null;
begin
  if not (select private.has_permission('imports.manage')) then
    raise exception 'Import management permission is required.'
      using errcode = '42501';
  end if;

  select reviews.*
  into v_review
  from public.university_calendar_reviews as reviews
  where reviews.id = p_review_id
  for update;

  if not found or v_review.status <> 'pending' then
    raise exception 'This key dates review has already been decided.'
      using errcode = '55000';
  end if;

  if not v_leave_out then
    if v_new_title = '' then
      raise exception 'Give the date a title.'
        using errcode = '22023';
    end if;
    if p_new_event_date is null
      or extract(year from p_new_event_date)::integer <> v_review.calendar_year then
      raise exception 'Choose a date in %.', v_review.calendar_year
        using errcode = '22023';
    end if;
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_review.events) as events(value)
    where events.value ->> 'date' = p_event_date::text
      and events.value ->> 'title' = p_title
  ) then
    raise exception 'That date is no longer part of this sync.'
      using errcode = 'P0002';
  end if;

  update public.university_calendar_reviews
  set events = (
    select coalesce(
      jsonb_agg(
        case
          when events.value ->> 'date' = p_event_date::text
            and events.value ->> 'title' = p_title
          then jsonb_build_object(
            'date', p_new_event_date::text,
            'title', v_new_title,
            'manual', true
          )
          else events.value
        end
        order by events.position
      ) filter (
        where not (
          v_leave_out
          and events.value ->> 'date' = p_event_date::text
          and events.value ->> 'title' = p_title
        )
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(v_review.events)
      with ordinality as events(value, position)
  )
  where id = p_review_id;
end;
$$;

comment on function public.revise_university_calendar_review(uuid, date, text, date, text) is 'Edits a date in a pending sync, or leaves it out when no replacement is given.';

revoke all on function public.revise_university_calendar_review(uuid, date, text, date, text)
  from public, anon;
grant execute on function public.revise_university_calendar_review(uuid, date, text, date, text)
  to authenticated, service_role;

-- Approval publishes a date corrected during review as manual. Otherwise
-- unchanged from 013.
create or replace function public.approve_university_calendar_review(p_review_id uuid)
returns uuid
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_review public.university_calendar_reviews;
  v_source_id bigint;
  v_source_page_id bigint;
  v_checked integer;
  v_added integer;
  v_changed integer;
  v_archived integer;
  v_import_id uuid;
begin
  if not (select private.has_permission('imports.manage')) then
    raise exception 'Import management permission is required.'
      using errcode = '42501';
  end if;

  select reviews.*
  into v_review
  from public.university_calendar_reviews as reviews
  where reviews.id = p_review_id
  for update;

  if not found then
    raise exception 'The key dates review could not be found.'
      using errcode = 'P0002';
  end if;

  if v_review.status <> 'pending' then
    raise exception 'This key dates review has already been decided.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_review.diagnostics) as diagnostics(value)
    where diagnostics.value ->> 'severity' = 'error'
  ) then
    raise exception 'This sync reported source errors, so it cannot be published.'
      using errcode = '22023';
  end if;

  v_checked := jsonb_array_length(v_review.events);
  if v_checked = 0 then
    raise exception 'This sync found no key dates to publish.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(
    'coursemap:catalogue-import:' || v_review.source_kind || ':'
      || v_review.source_base_url || ':' || v_review.calendar_year
  ));

  insert into public.catalogue_sources (name, kind, base_url, is_active)
  values (v_review.source_name, v_review.source_kind, v_review.source_base_url, true)
  on conflict (kind, base_url) do nothing;

  select sources.id
  into v_source_id
  from public.catalogue_sources as sources
  where sources.kind = v_review.source_kind
    and sources.base_url = v_review.source_base_url;

  insert into public.catalogue_source_pages (
    source_id,
    academic_year_id,
    kind,
    external_key,
    canonical_url,
    content_sha256,
    fetched_at
  )
  values (
    v_source_id,
    v_review.academic_year_id,
    'calendar',
    v_review.external_key,
    v_review.canonical_url,
    v_review.content_sha256,
    v_review.fetched_at
  )
  on conflict (source_id, academic_year_id, kind, external_key, content_sha256)
  do nothing;

  select pages.id
  into v_source_page_id
  from public.catalogue_source_pages as pages
  where pages.source_id = v_source_id
    and pages.academic_year_id = v_review.academic_year_id
    and pages.kind = 'calendar'
    and pages.external_key = v_review.external_key
    and pages.content_sha256 = v_review.content_sha256;

  with incoming as (
    select
      events.date as event_date,
      btrim(events.title) as title,
      bool_or(coalesce(events.manual, false)) as manual
    from jsonb_to_recordset(v_review.events)
      as events(date date, title text, manual boolean)
    group by events.date, btrim(events.title)
  ),
  inserted as (
    insert into public.university_calendar_events (
      academic_year_id,
      calendar_year,
      event_date,
      title,
      status,
      source_page_id,
      origin
    )
    select
      v_review.academic_year_id,
      v_review.calendar_year,
      incoming.event_date,
      incoming.title,
      'published',
      v_source_page_id,
      case when incoming.manual then 'manual' else 'anu' end
    from incoming
    on conflict (calendar_year, event_date, title) do nothing
    returning 1
  )
  select count(*) into v_added from inserted;

  with incoming as (
    select
      events.date as event_date,
      btrim(events.title) as title,
      bool_or(coalesce(events.manual, false)) as manual
    from jsonb_to_recordset(v_review.events)
      as events(date date, title text, manual boolean)
    group by events.date, btrim(events.title)
  ),
  republished as (
    update public.university_calendar_events as calendar_events
    set status = 'published',
      source_page_id = v_source_page_id,
      origin = case when incoming.manual then 'manual' else calendar_events.origin end
    from incoming
    where calendar_events.calendar_year = v_review.calendar_year
      and calendar_events.event_date = incoming.event_date
      and calendar_events.title = incoming.title
      and calendar_events.status <> 'published'
    returning 1
  )
  select count(*) into v_changed from republished;

  with incoming as (
    select distinct events.date as event_date, btrim(events.title) as title
    from jsonb_to_recordset(v_review.events) as events(date date, title text)
  ),
  archived as (
    update public.university_calendar_events as calendar_events
    set status = 'archived'
    where calendar_events.calendar_year = v_review.calendar_year
      and calendar_events.status = 'published'
      and calendar_events.origin = 'anu'
      and not exists (
        select 1
        from incoming
        where incoming.event_date = calendar_events.event_date
          and incoming.title = calendar_events.title
      )
    returning 1
  )
  select count(*) into v_archived from archived;

  insert into public.university_calendar_imports (
    academic_year_id,
    source_page_id,
    parser_version,
    status,
    checked_count,
    added_count,
    changed_count,
    archived_count,
    unchanged_count,
    failed_count,
    diagnostics
  )
  values (
    v_review.academic_year_id,
    v_source_page_id,
    v_review.parser_version,
    'succeeded',
    v_checked,
    v_added,
    v_changed,
    v_archived,
    greatest(v_checked - v_added - v_changed, 0),
    0,
    v_review.diagnostics
  )
  returning id into v_import_id;

  update public.academic_years
  set calendar_published_at = now()
  where id = v_review.academic_year_id;

  update public.university_calendar_reviews
  set status = 'approved',
    decided_by = (select auth.uid()),
    decided_at = statement_timestamp(),
    import_id = v_import_id
  where id = v_review.id;

  return v_import_id;
end;
$$;
