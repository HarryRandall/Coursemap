-- Period identity is independent of whether ANU has published calendar dates.
alter table public.academic_periods
  alter column starts_on drop not null,
  alter column ends_on drop not null,
  add column starts_event_id bigint references public.university_calendar_events(id) on delete set null,
  add column ends_event_id bigint references public.university_calendar_events(id) on delete set null,
  add constraint academic_periods_date_pair_check
    check ((starts_on is null) = (ends_on is null));

create index academic_periods_starts_event_idx on public.academic_periods(starts_event_id);
create index academic_periods_ends_event_idx on public.academic_periods(ends_event_id);

comment on column public.academic_periods.starts_event_id is
  'Published key date supplying the period start; null for undated or independently entered periods.';
comment on column public.academic_periods.ends_event_id is
  'Published key date supplying the period end; exam dates are separate calendar events.';

create function private.university_calendar_periods(p_calendar_year integer, p_events jsonb)
returns table (
  code text, name text, short_name text, sort_order integer,
  starts_on date, ends_on date, starts_event_id bigint, ends_event_id bigint,
  issue text
)
language sql immutable
set search_path = ''
as $$
  with definitions(code, name, short_name, sort_order, title_pattern) as (
    values
      ('SUMMER', 'Summer Session', 'Summer', 5, 'summer session'),
      ('S1', 'First Semester', 'S1', 10, '(semester 1|first semester)'),
      ('AUTUMN', 'Autumn Session', 'Autumn', 15, 'autumn session'),
      ('WINTER', 'Winter Session', 'Winter', 20, 'winter session'),
      ('S2', 'Second Semester', 'S2', 30, '(semester 2|second semester)'),
      ('SPRING', 'Spring Session', 'Spring', 35, 'spring session')
  ), events as (
    select events.id, events.date, lower(regexp_replace(btrim(events.title), '\s+', ' ', 'g')) as title
    from jsonb_to_recordset(p_events) as events(id bigint, date date, title text)
    where extract(year from events.date) = p_calendar_year
  ), bounds as (
    select definitions.*,
      count(distinct events.date) filter (where events.title ~ ('^' || title_pattern || ' (begins|commences|starts)\.?$')) as starts_count,
      count(distinct events.date) filter (where events.title ~ ('^' || title_pattern || ' ends\.?$')) as ends_count,
      min(events.date) filter (where events.title ~ ('^' || title_pattern || ' (begins|commences|starts)\.?$')) as start_date,
      min(events.date) filter (where events.title ~ ('^' || title_pattern || ' ends\.?$')) as end_date,
      min(events.id) filter (where events.title ~ ('^' || title_pattern || ' (begins|commences|starts)\.?$')) as start_event_id,
      min(events.id) filter (where events.title ~ ('^' || title_pattern || ' ends\.?$')) as end_event_id
    from definitions
    left join events on events.title ~ ('^' || title_pattern || ' ')
    group by definitions.code, definitions.name, definitions.short_name,
      definitions.sort_order, definitions.title_pattern
  )
  select bounds.code, bounds.name, bounds.short_name, bounds.sort_order,
    case when starts_count = 1 and ends_count = 1 and end_date >= start_date then start_date end,
    case when starts_count = 1 and ends_count = 1 and end_date >= start_date then end_date end,
    case when starts_count = 1 and ends_count = 1 and end_date >= start_date then start_event_id end,
    case when starts_count = 1 and ends_count = 1 and end_date >= start_date then end_event_id end,
    case
      when starts_count > 1 or ends_count > 1 then 'Conflicting calendar dates. Existing dates are kept.'
      when starts_count = 0 and ends_count = 0 then 'Calendar dates pending.'
      when starts_count = 0 then 'Start date missing. Existing dates are kept.'
      when ends_count = 0 then 'End date missing. Existing dates are kept.'
      when end_date < start_date then 'End date precedes start date. Existing dates are kept.'
    end
  from bounds
  order by bounds.sort_order;
$$;

create function private.ensure_academic_periods(p_calendar_year integer)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_calendar_year is null or p_calendar_year not between 2000 and 2200 then
    raise exception 'Choose a year between 2000 and 2200.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('coursemap:academic-periods:' || p_calendar_year));
  insert into public.academic_periods (
    calendar_year, code, name, short_name, sort_order, status
  )
  select p_calendar_year, periods.code, periods.name, periods.short_name,
    periods.sort_order, 'published'
  from private.university_calendar_periods(p_calendar_year, '[]') as periods
  on conflict (calendar_year, code) do nothing;
end;
$$;

-- All publishing paths stamp the academic year in their transaction. Deriving
-- periods there keeps console approval and the local importer in agreement.
create function private.reconcile_academic_periods(p_calendar_year integer)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  calendar_events jsonb;
begin
  perform private.ensure_academic_periods(p_calendar_year);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', events.id, 'date', events.event_date, 'title', events.title
  )), '[]') into calendar_events
  from public.university_calendar_events as events
  where events.calendar_year = p_calendar_year and events.status = 'published';

  update public.academic_periods as existing
  set starts_on = incoming.starts_on, ends_on = incoming.ends_on,
    starts_event_id = incoming.starts_event_id, ends_event_id = incoming.ends_event_id,
    status = 'published', sort_order = incoming.sort_order
  from private.university_calendar_periods(p_calendar_year, calendar_events) as incoming
  where existing.calendar_year = p_calendar_year and existing.code = incoming.code
    and incoming.issue is null
    and (existing.starts_on, existing.ends_on, existing.starts_event_id, existing.ends_event_id, existing.status, existing.sort_order)
      is distinct from (incoming.starts_on, incoming.ends_on, incoming.starts_event_id, incoming.ends_event_id, 'published', incoming.sort_order);
end;
$$;

create function private.sync_academic_year_periods()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.reconcile_academic_periods(new.year);
  return new;
end;
$$;

create trigger academic_years_sync_periods
  after insert or update of calendar_published_at on public.academic_years
  for each row execute function private.sync_academic_year_periods();

-- Manual edits reconcile after their final event and audit writes.
create or replace function public.save_university_calendar_event(
  p_calendar_year integer,
  p_event_date date,
  p_title text,
  p_event_id bigint default null
) returns bigint
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_academic_year_id bigint;
  v_existing public.university_calendar_events;
  v_event_id bigint;
begin
  if not (select private.has_permission('imports.manage')) then
    raise exception 'Import management permission is required.'
      using errcode = '42501';
  end if;

  if v_title = '' then
    raise exception 'Give the date a title.'
      using errcode = '22023';
  end if;

  if p_event_date is null
    or extract(year from p_event_date)::integer <> p_calendar_year then
    raise exception 'Choose a date in %.', p_calendar_year
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.university_calendar_events as events
    where events.calendar_year = p_calendar_year
      and events.event_date = p_event_date
      and events.title = v_title
      and events.status = 'published'
      and events.id is distinct from p_event_id
  ) then
    raise exception 'That date and title are already published.'
      using errcode = '23505';
  end if;

  if p_event_id is not null then
    select events.*
    into v_existing
    from public.university_calendar_events as events
    where events.id = p_event_id
      and events.calendar_year = p_calendar_year
      and events.status = 'published'
    for update;

    if not found then
      raise exception 'That key date is no longer published.'
        using errcode = 'P0002';
    end if;

    if v_existing.event_date = p_event_date and v_existing.title = v_title then
      perform private.reconcile_academic_periods(p_calendar_year);
      return v_existing.id;
    end if;

    -- The edited date and title may match a date removed earlier. Restore
    -- that row rather than colliding with it, and retire the edited one.
    select events.id
    into v_event_id
    from public.university_calendar_events as events
    where events.calendar_year = p_calendar_year
      and events.event_date = p_event_date
      and events.title = v_title
      and events.status <> 'published';

    if v_event_id is not null then
      update public.university_calendar_events
      set status = 'archived'
      where id = p_event_id;

      update public.university_calendar_events
      set status = 'published',
        origin = 'manual'
      where id = v_event_id;
    else
      v_event_id := p_event_id;

      update public.university_calendar_events
      set event_date = p_event_date,
        title = v_title,
        origin = 'manual'
      where id = p_event_id;
    end if;

    insert into public.university_calendar_event_changes (
      event_id, calendar_year, action, event_date, title, previous_date, previous_title
    )
    values (
      v_event_id, p_calendar_year, 'edited', p_event_date, v_title,
      v_existing.event_date, v_existing.title
    );

    perform private.reconcile_academic_periods(p_calendar_year);
    return v_event_id;
  end if;

  insert into public.academic_years (year)
  values (p_calendar_year)
  on conflict (year) do nothing;

  select years.id
  into v_academic_year_id
  from public.academic_years as years
  where years.year = p_calendar_year;

  insert into public.university_calendar_events (
    academic_year_id, calendar_year, event_date, title, status, origin
  )
  values (
    v_academic_year_id, p_calendar_year, p_event_date, v_title, 'published', 'manual'
  )
  on conflict (calendar_year, event_date, title) do update
  set status = 'published',
    origin = 'manual'
  returning id into v_event_id;

  insert into public.university_calendar_event_changes (
    event_id, calendar_year, action, event_date, title
  )
  values (v_event_id, p_calendar_year, 'added', p_event_date, v_title);

  perform private.reconcile_academic_periods(p_calendar_year);
  return v_event_id;
end;
$$;


create or replace function public.remove_university_calendar_event(p_event_id bigint)
returns void
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_event public.university_calendar_events;
begin
  if not (select private.has_permission('imports.manage')) then
    raise exception 'Import management permission is required.'
      using errcode = '42501';
  end if;

  update public.university_calendar_events
  set status = 'archived'
  where id = p_event_id
    and status = 'published'
  returning * into v_event;

  if not found then
    raise exception 'That key date is no longer published.'
      using errcode = 'P0002';
  end if;

  insert into public.university_calendar_event_changes (
    event_id, calendar_year, action, event_date, title
  )
  values (v_event.id, v_event.calendar_year, 'removed', v_event.event_date, v_event.title);
  perform private.reconcile_academic_periods(v_event.calendar_year);
end;
$$;


create function public.preview_university_calendar_periods(p_review_id uuid)
returns table (
  code text, name text, starts_on date, ends_on date,
  previous_starts_on date, previous_ends_on date, issue text
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  selected_review public.university_calendar_reviews;
  calendar_events jsonb;
begin
  if not (select private.has_permission('imports.manage')) then
    raise exception 'Import management permission is required.' using errcode = '42501';
  end if;
  select * into selected_review from public.university_calendar_reviews
  where id = p_review_id and status = 'pending';
  if not found then
    raise exception 'The pending key dates review could not be found.' using errcode = 'P0002';
  end if;

  -- Approval retains published manual events even when this sync omits them.
  select selected_review.events || coalesce(jsonb_agg(jsonb_build_object(
    'date', events.event_date, 'title', events.title
  )), '[]') into calendar_events
  from public.university_calendar_events as events
  where events.calendar_year = selected_review.calendar_year
    and events.status = 'published' and events.origin = 'manual';

  return query
  select incoming.code, incoming.name,
    coalesce(incoming.starts_on, existing.starts_on),
    coalesce(incoming.ends_on, existing.ends_on),
    existing.starts_on, existing.ends_on,
    case when incoming.issue = 'Calendar dates pending.' and existing.starts_on is not null
      then 'No calendar boundaries found. Existing dates are kept.'
      else incoming.issue end
  from private.university_calendar_periods(selected_review.calendar_year, calendar_events) as incoming
  left join public.academic_periods as existing
    on existing.calendar_year = selected_review.calendar_year and existing.code = incoming.code
  order by incoming.sort_order;
end;
$$;

revoke all on function private.university_calendar_periods(integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.ensure_academic_periods(integer) from public, anon, authenticated, service_role;
revoke all on function private.reconcile_academic_periods(integer) from public, anon, authenticated, service_role;
revoke all on function private.sync_academic_year_periods() from public, anon, authenticated, service_role;
revoke all on function public.preview_university_calendar_periods(uuid) from public, anon, authenticated, service_role;
grant execute on function public.preview_university_calendar_periods(uuid) to authenticated;

-- Recorded attempts must keep their period identity readable even when its
-- calendar dates are still in draft or the period has since been archived.
create policy academic_periods_read_attempts on public.academic_periods
  for select to authenticated
  using (exists (
    select 1 from public.course_attempts as attempts
    where attempts.academic_period_id = academic_periods.id
      and attempts.owner_id = (select auth.uid())
  ));

-- Backfill registered years, including those whose calendar was already
-- imported. Incomplete sources leave existing periods and linked history intact.
do $$
declare
  calendar_year integer;
begin
  for calendar_year in
    select year from public.academic_years
    union select events.calendar_year from public.university_calendar_events as events
    union select items.planned_calendar_year from public.plan_items as items
      where items.planned_calendar_year is not null
  loop
    perform private.reconcile_academic_periods(calendar_year);
  end loop;
end;
$$;

update public.plan_items as items
set academic_period_id = periods.id
from public.academic_periods as periods
where items.academic_period_id is null
  and items.planned_calendar_year = periods.calendar_year
  and items.planned_period_code = periods.code;
