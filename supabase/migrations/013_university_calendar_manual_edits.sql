-- Key dates an import administrator adds or corrects by hand.
--
-- Every event now records where it came from. Dates added or edited in the
-- admin console are 'manual', and a later ANU sync never archives them, so a
-- correction is not silently undone by the next sync. Each manual change is
-- kept in university_calendar_event_changes, which the admin changelog reads
-- beside the sync publications in university_calendar_imports.

alter table public.university_calendar_events
  add column origin text default 'anu'::text not null,
  add constraint university_calendar_events_origin_check check (
    origin = any (array['anu'::text, 'manual'::text])
  );

comment on column public.university_calendar_events.origin is 'anu when the date came from an ANU calendar sync; manual when an administrator added or edited it, which keeps later syncs from archiving it.';

create table public.university_calendar_event_changes (
  id bigint generated always as identity primary key,
  event_id bigint not null
    references public.university_calendar_events (id),
  calendar_year smallint not null,
  action text not null,
  event_date date not null,
  title text not null,
  previous_date date,
  previous_title text,
  changed_by uuid default auth.uid()
    references auth.users (id) on delete set null,
  changed_at timestamp with time zone default statement_timestamp() not null,
  constraint university_calendar_event_changes_action_check check (
    action = any (array['added'::text, 'edited'::text, 'removed'::text])
  ),
  constraint university_calendar_event_changes_previous_check check (
    (action = 'edited') = (previous_date is not null and previous_title is not null)
  )
);

comment on table public.university_calendar_event_changes is 'Key dates added, edited or removed by hand in the admin console.';

create index university_calendar_event_changes_year_idx
  on public.university_calendar_event_changes (calendar_year, changed_at desc);

create index university_calendar_event_changes_event_idx
  on public.university_calendar_event_changes (event_id);

create index university_calendar_event_changes_changed_by_idx
  on public.university_calendar_event_changes (changed_by);

create trigger university_calendar_event_changes_reject_mutation
  before delete or update on public.university_calendar_event_changes
  for each row execute function private.reject_immutable_catalogue_record_mutation();

alter table public.university_calendar_event_changes enable row level security;

create policy university_calendar_event_changes_import_admin_read
  on public.university_calendar_event_changes
  for select to authenticated
  using ((select private.has_permission('imports.manage'::text) as has_permission));

revoke all on table public.university_calendar_event_changes
  from public, anon, authenticated, service_role;
revoke all on sequence public.university_calendar_event_changes_id_seq
  from public, anon, authenticated, service_role;
grant all on table public.university_calendar_event_changes to service_role;
grant select on table public.university_calendar_event_changes to authenticated;
grant all on sequence public.university_calendar_event_changes_id_seq to service_role;

-- Administrators also need to see archived dates, so a removed date can be
-- told apart from one that never existed.
create policy university_calendar_events_import_admin_read
  on public.university_calendar_events
  for select to authenticated
  using ((select private.has_permission('imports.manage'::text) as has_permission));

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

  return v_event_id;
end;
$$;

comment on function public.save_university_calendar_event(integer, date, text, bigint) is 'Adds a key date by hand, or edits a published one when an id is given. Either way the date becomes manual.';

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
end;
$$;

comment on function public.remove_university_calendar_event(bigint) is 'Archives a published key date so students no longer see it.';

revoke all on function public.save_university_calendar_event(integer, date, text, bigint)
  from public, anon;
revoke all on function public.remove_university_calendar_event(bigint) from public, anon;
grant execute on function public.save_university_calendar_event(integer, date, text, bigint)
  to authenticated, service_role;
grant execute on function public.remove_university_calendar_event(bigint)
  to authenticated, service_role;

-- Approval keeps manual dates: the archive step now skips them. The rest of
-- the function is unchanged from 012.
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
    select distinct events.date as event_date, btrim(events.title) as title
    from jsonb_to_recordset(v_review.events) as events(date date, title text)
  ),
  inserted as (
    insert into public.university_calendar_events (
      academic_year_id,
      calendar_year,
      event_date,
      title,
      status,
      source_page_id
    )
    select
      v_review.academic_year_id,
      v_review.calendar_year,
      incoming.event_date,
      incoming.title,
      'published',
      v_source_page_id
    from incoming
    on conflict (calendar_year, event_date, title) do nothing
    returning 1
  )
  select count(*) into v_added from inserted;

  with incoming as (
    select distinct events.date as event_date, btrim(events.title) as title
    from jsonb_to_recordset(v_review.events) as events(date date, title text)
  ),
  republished as (
    update public.university_calendar_events as calendar_events
    set status = 'published',
      source_page_id = v_source_page_id
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
