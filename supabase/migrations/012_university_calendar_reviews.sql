-- Key dates reviewed in the admin console before they reach students.
--
-- Syncing a year from the ANU university calendar stages the parsed events as
-- a review. Nothing students read changes until an import administrator
-- approves it, at which point the events are published, dates the source no
-- longer lists are archived and the run is recorded in
-- university_calendar_imports exactly as the command-line importer records
-- one. A year holds at most one pending review; a fresh sync supersedes it.

create table public.university_calendar_reviews (
  id uuid default gen_random_uuid() primary key,
  academic_year_id bigint not null,
  calendar_year smallint not null,
  parser_version text not null,
  source_name text not null,
  source_kind text not null,
  source_base_url text not null,
  external_key text not null,
  canonical_url text not null,
  content_sha256 text not null,
  fetched_at timestamp with time zone not null,
  events jsonb not null,
  diagnostics jsonb default '[]'::jsonb not null,
  status text default 'pending'::text not null,
  requested_by uuid default auth.uid(),
  requested_at timestamp with time zone default statement_timestamp() not null,
  decided_by uuid,
  decided_at timestamp with time zone,
  import_id uuid,
  constraint university_calendar_reviews_academic_year_fkey
    foreign key (academic_year_id, calendar_year)
    references public.academic_years (id, year),
  constraint university_calendar_reviews_import_fkey
    foreign key (import_id) references public.university_calendar_imports (id),
  constraint university_calendar_reviews_requested_by_fkey
    foreign key (requested_by) references auth.users (id) on delete set null,
  constraint university_calendar_reviews_decided_by_fkey
    foreign key (decided_by) references auth.users (id) on delete set null,
  constraint university_calendar_reviews_status_check check (
    status = any (array['pending'::text, 'approved'::text, 'discarded'::text, 'superseded'::text])
  ),
  constraint university_calendar_reviews_events_array_check check (jsonb_typeof(events) = 'array'::text),
  constraint university_calendar_reviews_diagnostics_array_check check (jsonb_typeof(diagnostics) = 'array'::text),
  constraint university_calendar_reviews_parser_version_not_blank_check check (btrim(parser_version) <> ''::text),
  constraint university_calendar_reviews_source_not_blank_check check (
    btrim(source_name) <> ''::text and btrim(source_kind) <> ''::text
  ),
  constraint university_calendar_reviews_source_base_url_check check (source_base_url ~ '^https://[^[:space:]]+$'::text),
  constraint university_calendar_reviews_canonical_url_check check (canonical_url ~ '^https://[^[:space:]]+$'::text),
  constraint university_calendar_reviews_external_key_not_blank_check check (btrim(external_key) <> ''::text),
  constraint university_calendar_reviews_content_sha256_check check (content_sha256 ~ '^[0-9a-f]{64}$'::text),
  constraint university_calendar_reviews_decision_check check (
    (status = 'pending') = (decided_at is null)
  ),
  constraint university_calendar_reviews_import_check check (
    (status = 'approved') = (import_id is not null)
  )
);

comment on table public.university_calendar_reviews is 'University calendar syncs staged from the admin console, published only once an import administrator approves them.';

create unique index university_calendar_reviews_one_pending_idx
  on public.university_calendar_reviews (calendar_year)
  where status = 'pending';

create index university_calendar_reviews_year_requested_idx
  on public.university_calendar_reviews (academic_year_id, requested_at desc);

create index university_calendar_reviews_import_idx
  on public.university_calendar_reviews (import_id)
  where import_id is not null;

create index university_calendar_reviews_requested_by_idx
  on public.university_calendar_reviews (requested_by);

create index university_calendar_reviews_decided_by_idx
  on public.university_calendar_reviews (decided_by);

alter table public.university_calendar_reviews enable row level security;

create policy university_calendar_reviews_import_admin_read
  on public.university_calendar_reviews
  for select to authenticated
  using ((select private.has_permission('imports.manage'::text) as has_permission));

-- Reviews change state only through the functions below, so a pending review
-- cannot be marked approved without its events actually being published.
revoke all on table public.university_calendar_reviews
  from public, anon, authenticated, service_role;
grant all on table public.university_calendar_reviews to service_role;
grant select on table public.university_calendar_reviews to authenticated;

create or replace function public.stage_university_calendar_review(
  p_calendar_year integer,
  p_parser_version text,
  p_source jsonb,
  p_document jsonb,
  p_events jsonb,
  p_diagnostics jsonb
) returns uuid
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_academic_year_id bigint;
  v_review_id uuid;
begin
  if not (select private.has_permission('imports.manage')) then
    raise exception 'Import management permission is required.'
      using errcode = '42501';
  end if;

  if p_calendar_year is null or p_calendar_year < 2000 or p_calendar_year > 2200 then
    raise exception 'The calendar year must be between 2000 and 2200.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'The calendar events must be an array.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_events) as events(value)
    where jsonb_typeof(events.value) <> 'object'
      or coalesce(events.value ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or left(events.value ->> 'date', 4)::integer <> p_calendar_year
      or btrim(coalesce(events.value ->> 'title', '')) = ''
  ) then
    raise exception 'Every calendar event needs a date within % and a title.', p_calendar_year
      using errcode = '22023';
  end if;

  insert into public.academic_years (year)
  values (p_calendar_year)
  on conflict (year) do nothing;

  select years.id
  into v_academic_year_id
  from public.academic_years as years
  where years.year = p_calendar_year;

  perform pg_advisory_xact_lock(
    hashtext('coursemap:university-calendar-review:' || p_calendar_year)
  );

  update public.university_calendar_reviews
  set status = 'superseded',
    decided_by = (select auth.uid()),
    decided_at = statement_timestamp()
  where calendar_year = p_calendar_year
    and status = 'pending';

  insert into public.university_calendar_reviews (
    academic_year_id,
    calendar_year,
    parser_version,
    source_name,
    source_kind,
    source_base_url,
    external_key,
    canonical_url,
    content_sha256,
    fetched_at,
    events,
    diagnostics,
    requested_by
  )
  values (
    v_academic_year_id,
    p_calendar_year,
    p_parser_version,
    p_source ->> 'name',
    p_source ->> 'kind',
    p_source ->> 'baseUrl',
    p_document ->> 'externalKey',
    p_document ->> 'canonicalUrl',
    p_document ->> 'contentSha256',
    (p_document ->> 'fetchedAt')::timestamp with time zone,
    p_events,
    coalesce(p_diagnostics, '[]'::jsonb),
    (select auth.uid())
  )
  returning id into v_review_id;

  return v_review_id;
end;
$$;

comment on function public.stage_university_calendar_review(integer, text, jsonb, jsonb, jsonb, jsonb) is 'Stages a parsed university calendar for review, superseding any pending review for the same year.';

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

  -- The same lock the command-line importer takes, so the two cannot publish
  -- the same year concurrently.
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

comment on function public.approve_university_calendar_review(uuid) is 'Publishes a pending university calendar review and records the import run.';

create or replace function public.discard_university_calendar_review(p_review_id uuid)
returns void
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  if not (select private.has_permission('imports.manage')) then
    raise exception 'Import management permission is required.'
      using errcode = '42501';
  end if;

  update public.university_calendar_reviews
  set status = 'discarded',
    decided_by = (select auth.uid()),
    decided_at = statement_timestamp()
  where id = p_review_id
    and status = 'pending';

  if not found then
    raise exception 'This key dates review has already been decided.'
      using errcode = '55000';
  end if;
end;
$$;

comment on function public.discard_university_calendar_review(uuid) is 'Discards a pending university calendar review without publishing it.';

revoke all on function public.stage_university_calendar_review(integer, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon;
revoke all on function public.approve_university_calendar_review(uuid) from public, anon;
revoke all on function public.discard_university_calendar_review(uuid) from public, anon;

grant execute on function public.stage_university_calendar_review(integer, text, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;
grant execute on function public.approve_university_calendar_review(uuid)
  to authenticated, service_role;
grant execute on function public.discard_university_calendar_review(uuid)
  to authenticated, service_role;
