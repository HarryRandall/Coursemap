-- Coursemap baseline, part 5 of 8: student plans, attempts and approvals
--
-- What a student is actually doing: their plan, the courses in it, the
-- structures it claims, the attempts they have recorded, and the approval
-- requests that hang off them. Plan writes go through security-definer
-- functions rather than direct table access, so a plan cannot reference a
-- course year that is not offered.

create table if not exists public.approval_events (
    id bigint not null,
    approval_request_id uuid not null,
    owner_id uuid not null,
    event_kind text not null,
    actor_id uuid,
    note text,
    details jsonb default '{}'::jsonb not null,
    occurred_at timestamp with time zone default now() not null,
    constraint approval_events_details_object_check check ((jsonb_typeof(details) = 'object'::text)),
    constraint approval_events_kind_check check ((event_kind = any (array['created'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);

create table if not exists public.approval_requests (
    id uuid default gen_random_uuid() not null,
    owner_id uuid not null,
    plan_item_id uuid,
    academic_period_id bigint,
    request_kind text not null,
    status text default 'pending'::text not null,
    reason text not null,
    decision_note text,
    resolved_by uuid,
    requested_at timestamp with time zone default now() not null,
    resolved_at timestamp with time zone,
    updated_at timestamp with time zone default now() not null,
    constraint approval_requests_decision_note_not_blank_check check (((decision_note is null) or (btrim(decision_note) <> ''::text))),
    constraint approval_requests_kind_check check ((request_kind = any (array['convener_permission'::text, 'overload'::text, 'credit'::text, 'substitution'::text, 'other'::text]))),
    constraint approval_requests_reason_not_blank_check check ((btrim(reason) <> ''::text)),
    constraint approval_requests_resolution_check check ((((status = 'pending'::text) and (decision_note is null) and (resolved_at is null) and (resolved_by is null)) or ((status <> 'pending'::text) and (resolved_at is not null) and (resolved_by is not null)))),
    constraint approval_requests_status_check check ((status = any (array['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);

create table if not exists public.course_attempts (
    id uuid default gen_random_uuid() not null,
    owner_id uuid not null,
    academic_period_id bigint not null,
    status text not null,
    mark numeric(5,2),
    grade text,
    units_attempted numeric(5,2) not null,
    units_earned numeric(5,2) default 0 not null,
    source text default 'user_entered'::text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    catalogue_version_id bigint not null,
    constraint course_attempts_mark_check check (((mark is null) or ((mark >= (0)::numeric) and (mark <= (100)::numeric)))),
    constraint course_attempts_source_check check ((source = any (array['user_entered'::text, 'imported'::text]))),
    constraint course_attempts_status_check check ((status = any (array['enrolled'::text, 'completed'::text, 'failed'::text, 'withdrawn'::text, 'credited'::text]))),
    constraint course_attempts_units_check check (((units_attempted > (0)::numeric) and (units_earned >= (0)::numeric) and (units_earned <= units_attempted)))
);

create table if not exists public.plan_items (
    id uuid default gen_random_uuid() not null,
    plan_id uuid not null,
    owner_id uuid not null,
    catalogue_record_id bigint not null,
    academic_period_id bigint,
    sort_order bigint default 0 not null,
    notes text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    planned_calendar_year smallint,
    planned_period_code text,
    constraint plan_items_planned_calendar_year_check check (((planned_calendar_year is null) or ((planned_calendar_year >= 2000) and (planned_calendar_year <= 2200)))),
    constraint plan_items_planned_period_code_check check (((planned_period_code is null) or (planned_period_code ~ '^[A-Z0-9][A-Z0-9-]*$'::text))),
    constraint plan_items_planned_period_pair_check check ((((planned_calendar_year is null) and (planned_period_code is null)) or ((planned_calendar_year is not null) and (planned_period_code is not null)))),
    constraint plan_items_sort_order_check check ((sort_order >= 0))
);

create table if not exists public.plan_structures (
    id uuid default gen_random_uuid() not null,
    plan_id uuid not null,
    owner_id uuid not null,
    role text not null,
    position integer default 0 not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    catalogue_record_id bigint not null,
    constraint plan_structures_position_check check ((position >= 0)),
    constraint plan_structures_role_check check ((role = any (array['programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text])))
);

create table if not exists public.plans (
    id uuid default gen_random_uuid() not null,
    owner_id uuid not null,
    name text not null,
    is_primary boolean default false not null,
    status text default 'active'::text not null,
    commencement_year smallint not null,
    study_load text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    extension_years smallint default 0 not null,
    academic_year_id bigint not null,
    constraint plans_commencement_year_check check (((commencement_year >= 2000) and (commencement_year <= 2200))),
    constraint plans_extension_years_check check (((extension_years >= 0) and (extension_years <= 10))),
    constraint plans_name_not_blank_check check ((btrim(name) <> ''::text)),
    constraint plans_primary_active_check check (((not is_primary) or (status = 'active'::text))),
    constraint plans_status_check check ((status = any (array['active'::text, 'archived'::text]))),
    constraint plans_study_load_check check ((study_load = any (array['full_time'::text, 'part_time'::text])))
);

alter table public.approval_events ALTER column id add generated always as identity (
    sequence NAME public.approval_events_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table only public.approval_events
    add constraint approval_events_pkey primary key (id);

alter table only public.approval_requests
    add constraint approval_requests_id_owner_unique unique (id, owner_id);

alter table only public.approval_requests
    add constraint approval_requests_pkey primary key (id);

alter table only public.course_attempts
    add constraint course_attempts_owner_snapshot_period_unique unique (owner_id, catalogue_version_id, academic_period_id);

alter table only public.course_attempts
    add constraint course_attempts_owner_version_period_unique unique (owner_id, catalogue_version_id, academic_period_id);

alter table only public.course_attempts
    add constraint course_attempts_pkey primary key (id);

alter table only public.plan_items
    add constraint plan_items_id_owner_unique unique (id, owner_id);

alter table only public.plan_items
    add constraint plan_items_pkey primary key (id);

alter table only public.plan_items
    add constraint plan_items_plan_course_unique unique (plan_id, catalogue_record_id);

alter table only public.plan_structures
    add constraint plan_structures_pkey primary key (id);

alter table only public.plan_structures
    add constraint plan_structures_plan_structure_year_unique unique (plan_id, catalogue_record_id);

alter table only public.plans
    add constraint plans_id_owner_academic_year_unique unique (id, owner_id, academic_year_id);

alter table only public.plans
    add constraint plans_id_owner_unique unique (id, owner_id);

alter table only public.plans
    add constraint plans_pkey primary key (id);

alter table only public.approval_events
    add constraint approval_events_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null;

alter table only public.approval_events
    add constraint approval_events_request_owner_fkey foreign key (approval_request_id, owner_id) references public.approval_requests(id, owner_id) on delete cascade;

alter table only public.approval_requests
    add constraint approval_requests_academic_period_id_fkey foreign key (academic_period_id) references public.academic_periods(id);

alter table only public.approval_requests
    add constraint approval_requests_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;

alter table only public.approval_requests
    add constraint approval_requests_plan_item_owner_fkey foreign key (plan_item_id, owner_id) references public.plan_items(id, owner_id) on delete set null (plan_item_id);

alter table only public.approval_requests
    add constraint approval_requests_resolved_by_fkey foreign key (resolved_by) references auth.users(id) on delete restrict;

alter table only public.course_attempts
    add constraint course_attempts_academic_period_id_fkey foreign key (academic_period_id) references public.academic_periods(id);

alter table only public.course_attempts
    add constraint course_attempts_catalogue_version_fkey foreign key (catalogue_version_id) references public.catalogue_versions(id);

alter table only public.course_attempts
    add constraint course_attempts_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;

alter table only public.plan_items
    add constraint plan_items_academic_period_id_fkey foreign key (academic_period_id) references public.academic_periods(id);

alter table only public.plan_items
    add constraint plan_items_catalogue_record_fkey foreign key (catalogue_record_id) references public.catalogue_records(id);

alter table only public.plan_items
    add constraint plan_items_plan_owner_fkey foreign key (plan_id, owner_id) references public.plans(id, owner_id) on delete cascade;

alter table only public.plan_structures
    add constraint plan_structures_catalogue_record_fkey foreign key (catalogue_record_id) references public.catalogue_records(id);

alter table only public.plans
    add constraint plans_academic_year_id_fkey foreign key (academic_year_id) references public.academic_years(id);

alter table only public.plans
    add constraint plans_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;

create index approval_events_actor_id_idx on public.approval_events using btree (actor_id);

create unique index approval_events_one_created_idx on public.approval_events using btree (approval_request_id) where (event_kind = 'created'::text);

create unique index approval_events_one_resolution_idx on public.approval_events using btree (approval_request_id) where (event_kind = any (array['approved'::text, 'rejected'::text, 'cancelled'::text]));

create index approval_events_owner_id_idx on public.approval_events using btree (owner_id);

create index approval_events_request_owner_occurred_idx on public.approval_events using btree (approval_request_id, owner_id, occurred_at, id);

create index approval_requests_academic_period_id_idx on public.approval_requests using btree (academic_period_id);

create index approval_requests_owner_status_requested_idx on public.approval_requests using btree (owner_id, status, requested_at desc);

create index approval_requests_plan_item_owner_idx on public.approval_requests using btree (plan_item_id, owner_id);

create index approval_requests_resolved_by_idx on public.approval_requests using btree (resolved_by);

create index course_attempts_academic_period_id_idx on public.course_attempts using btree (academic_period_id);

create index course_attempts_course_snapshot_id_idx on public.course_attempts using btree (catalogue_version_id);

create index course_attempts_owner_period_idx on public.course_attempts using btree (owner_id, academic_period_id);

create index plan_items_academic_period_id_idx on public.plan_items using btree (academic_period_id);

create index plan_items_course_id_idx on public.plan_items using btree (catalogue_record_id);

create index plan_items_owner_id_idx on public.plan_items using btree (owner_id);

create index plan_items_plan_owner_idx on public.plan_items using btree (plan_id, owner_id);

create index plan_items_plan_period_order_idx on public.plan_items using btree (plan_id, academic_period_id, sort_order, id);

create index plan_items_planned_term_order_idx on public.plan_items using btree (plan_id, planned_calendar_year, planned_period_code, sort_order, id);

create unique index plan_structures_one_major_idx on public.plan_structures using btree (plan_id) where (role = 'major'::text);

create unique index plan_structures_one_programme_idx on public.plan_structures using btree (plan_id) where (role = 'programme'::text);

create index plan_structures_owner_id_idx on public.plan_structures using btree (owner_id);

create index plans_academic_year_id_idx on public.plans using btree (academic_year_id);

create unique index plans_one_primary_per_owner_idx on public.plans using btree (owner_id) where is_primary;

create index plans_owner_updated_idx on public.plans using btree (owner_id, updated_at desc);

create or replace function private.append_approval_created_event() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  insert into public.approval_events (
    approval_request_id,
    owner_id,
    event_kind,
    actor_id
  )
  values (
    new.id,
    new.owner_id,
    'created',
    (select auth.uid())
  );

  return new;
end;
$$;

create or replace function private.append_approval_resolution_event() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  insert into public.approval_events (
    approval_request_id,
    owner_id,
    event_kind,
    actor_id,
    note
  )
  values (
    new.id,
    new.owner_id,
    new.status,
    new.resolved_by,
    new.decision_note
  );

  return new;
end;
$$;

create or replace function private.can_read_catalogue_item(p_item_id bigint) returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
  select private.can_read_catalogue_drafts()
    or exists (
      select 1
      from public.catalogue_records as item_years
      where item_years.code_id = p_item_id
        and item_years.published_version_id is not null
        and item_years.archived_at is null
    )
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
$$;

create or replace function private.can_read_version(p_version_id bigint) returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
  select private.is_published_version(p_version_id)
    or private.can_read_catalogue_drafts()
    or exists (
      select 1
      from public.course_attempts as attempts
      where attempts.catalogue_version_id = p_version_id
        and attempts.owner_id = (select auth.uid())
    );
$$;

create or replace function private.enforce_course_attempt_snapshot_lineage() returns trigger
    language plpgsql
    set search_path to ''
    as $$
declare
  snapshot_academic_year smallint;
  period_calendar_year smallint;
begin
  select academic_years.year
  into snapshot_academic_year
  from public.catalogue_versions as snapshots
  join public.catalogue_records as item_years
    on item_years.id = snapshots.record_id
  join public.academic_years
    on academic_years.id = snapshots.academic_year_id
  where snapshots.id = new.catalogue_version_id
    and snapshots.kind = 'course'
    and item_years.id = snapshots.record_id;
  if snapshot_academic_year is null then
    raise exception
      'course attempt snapshot does not belong to the selected course'
      using errcode = '23503';
  end if;
  select academic_periods.calendar_year
  into period_calendar_year
  from public.academic_periods
  where academic_periods.id = new.academic_period_id;
  if period_calendar_year is not null
    and period_calendar_year <> snapshot_academic_year
  then
    raise exception
      'course attempt period year does not match the snapshot academic year'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.prepare_approval_resolution() returns trigger
    language plpgsql
    set search_path to ''
    as $$
declare
  reviewer_id uuid;
begin
  if old.plan_item_id is not null
    and new.plan_item_id is null
    and row(
      new.id,
      new.owner_id,
      new.academic_period_id,
      new.request_kind,
      new.status,
      new.reason,
      new.decision_note,
      new.resolved_by,
      new.requested_at,
      new.resolved_at
    ) is not distinct from row(
      old.id,
      old.owner_id,
      old.academic_period_id,
      old.request_kind,
      old.status,
      old.reason,
      old.decision_note,
      old.resolved_by,
      old.requested_at,
      old.resolved_at
    ) then
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'resolved approval requests are immutable'
      using errcode = '23514',
        constraint = 'approval_requests_terminal_immutable_check';
  end if;

  if new.status = 'pending' then
    raise exception 'approval request updates must resolve the pending request'
      using errcode = '23514',
        constraint = 'approval_requests_transition_check';
  end if;

  if row(
    new.id,
    new.owner_id,
    new.plan_item_id,
    new.academic_period_id,
    new.request_kind,
    new.reason,
    new.requested_at
  ) is distinct from row(
    old.id,
    old.owner_id,
    old.plan_item_id,
    old.academic_period_id,
    old.request_kind,
    old.reason,
    old.requested_at
  ) then
    raise exception 'approval request details are immutable after submission'
      using errcode = '23514',
        constraint = 'approval_requests_details_immutable_check';
  end if;

  reviewer_id := (select auth.uid());
  if reviewer_id is null
    or not (select private.has_permission('approvals.review')) then
    raise exception 'approval resolution requires an authorised reviewer'
      using errcode = '42501';
  end if;

  new.resolved_by := reviewer_id;
  new.resolved_at := now();

  return new;
end;
$$;

create or replace function private.require_active_plan_item_course_year() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  selected_archived_at timestamptz;
begin
  select item_years.archived_at
  into selected_archived_at
  from public.catalogue_records as item_years
  where item_years.id = new.catalogue_record_id
    and item_years.kind = 'course'
  for share of item_years;
  if not found then
    raise exception 'The selected course year was not found.'
      using errcode = 'P0002';
  end if;
  if selected_archived_at is not null then
    raise exception 'Plan items can reference only active course years.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.validate_plan_structure_kind() returns trigger
    language plpgsql
    set search_path to ''
    as $$
declare
  selected_kind text;
begin
  select item_years.kind
  into selected_kind
  from public.catalogue_records as item_years
  where item_years.id = new.catalogue_record_id;
  if selected_kind is not null and selected_kind is distinct from new.role then
    raise exception using
      errcode = '23514',
      message = 'The plan structure role must match the academic structure kind.';
  end if;
  return new;
end;
$$;

create or replace function public.add_current_user_plan_item(p_course_code text, p_academic_year smallint, p_planned_calendar_year smallint default null::smallint, p_planned_period_code text default null::text) returns uuid
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  user_id uuid := (select auth.uid());
  selected_plan_id uuid;
  selected_record_id bigint;
  selected_period_id bigint;
  next_sort_order bigint;
  created_item_id uuid;
  period_code text := nullif(upper(btrim(p_planned_period_code)), '');
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_academic_year is null then
    raise exception using
      errcode = '22023',
      message = 'A course academic year is required.';
  end if;

  if (p_planned_calendar_year is null) <> (period_code is null) then
    raise exception using
      errcode = '22023',
      message = 'Planned year and period must be supplied together.';
  end if;

  if p_planned_calendar_year is not null
    and p_planned_calendar_year <> p_academic_year
  then
    raise exception using
      errcode = '22023',
      message = 'The planned period must be in the selected course academic year.';
  end if;

  select plans.id
  into selected_plan_id
  from public.plans
  where plans.owner_id = user_id
    and plans.is_primary
    and plans.status = 'active'
  for update of plans;

  if selected_plan_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Save a primary degree plan before adding courses.';
  end if;

  select item_years.id
  into selected_record_id
  from public.catalogue_codes as items
  join public.catalogue_records as item_years on item_years.code_id = items.id
  join public.academic_years
    on academic_years.id = item_years.academic_year_id
  where items.kind = 'course'
    and items.code = upper(btrim(p_course_code))
    and academic_years.year = p_academic_year
    and item_years.archived_at is null
    and item_years.published_version_id is not null
  limit 1;

  if selected_record_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The selected course has no published snapshot for the planned year.';
  end if;

  if p_planned_calendar_year is not null then
    select academic_periods.id
    into selected_period_id
    from public.academic_periods
    where academic_periods.calendar_year = p_planned_calendar_year
      and academic_periods.code = period_code
    limit 1;
  end if;

  select coalesce(max(plan_items.sort_order), -1) + 1
  into next_sort_order
  from public.plan_items
  where plan_items.plan_id = selected_plan_id
    and plan_items.owner_id = user_id
    and plan_items.planned_calendar_year is not distinct from p_planned_calendar_year
    and plan_items.planned_period_code is not distinct from period_code;

  insert into public.plan_items (
    plan_id,
    owner_id,
    catalogue_record_id,
    academic_period_id,
    planned_calendar_year,
    planned_period_code,
    sort_order
  ) values (
    selected_plan_id,
    user_id,
    selected_record_id,
    selected_period_id,
    p_planned_calendar_year,
    period_code,
    next_sort_order
  )
  returning id into created_item_id;

  return created_item_id;
end;
$$;

create or replace function public.current_user_course_attempt_version_projections(p_version_ids bigint[]) returns table(version_id bigint, projection jsonb)
    language plpgsql stable security definer
    set search_path to ''
    as $$
declare
  user_id uuid := (select auth.uid());
begin
  if user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_version_ids is null then
    raise exception 'Snapshot IDs are required.' using errcode = '22023';
  end if;
  if cardinality(p_version_ids) > 200 then
    raise exception 'At most 200 snapshot IDs may be requested.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_version_ids) as requested(requested_snapshot_id)
    where requested.requested_snapshot_id is null
  ) then
    raise exception 'Snapshot IDs cannot contain null values.'
      using errcode = '22023';
  end if;

  return query
  select
    snapshots.id,
    private.course_version_projection(snapshots.id)
  from public.catalogue_versions as snapshots
  where snapshots.id = any(p_version_ids)
    and snapshots.kind = 'course'
    and exists (
      select 1
      from public.course_attempts as attempts
      where attempts.catalogue_version_id = snapshots.id
        and attempts.owner_id = user_id
    )
  order by snapshots.id;
end;
$$;

create or replace function public.move_current_user_plan_item(p_plan_item_id uuid, p_planned_calendar_year smallint default null::smallint, p_planned_period_code text default null::text, p_before_plan_item_id uuid default null::uuid) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  user_id uuid := (select auth.uid());
  selected_plan_id uuid;
  selected_academic_year smallint;
  selected_period_id bigint;
  destination_sort_order bigint;
  period_code text := nullif(upper(btrim(p_planned_period_code)), '');
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if (p_planned_calendar_year is null) <> (period_code is null) then
    raise exception using
      errcode = '22023',
      message = 'Planned year and period must be supplied together.';
  end if;

  select plan_items.plan_id, academic_years.year
  into selected_plan_id, selected_academic_year
  from public.plan_items
  join public.catalogue_records
    on catalogue_records.id = plan_items.catalogue_record_id
  join public.academic_years
    on academic_years.id = catalogue_records.academic_year_id
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id
  for update of plan_items;

  if selected_plan_id is null then
    raise exception using errcode = 'P0002', message = 'Plan item not found.';
  end if;

  if p_planned_calendar_year is not null
    and p_planned_calendar_year <> selected_academic_year
  then
    raise exception using
      errcode = '22023',
      message = 'A planned course cannot be moved outside its selected academic year.';
  end if;

  perform 1
  from public.plan_items
  where plan_items.plan_id = selected_plan_id
    and plan_items.owner_id = user_id
  for update of plan_items;

  if p_planned_calendar_year is not null then
    select academic_periods.id
    into selected_period_id
    from public.academic_periods
    where academic_periods.calendar_year = p_planned_calendar_year
      and academic_periods.code = period_code
    limit 1;
  end if;

  if p_before_plan_item_id is not null then
    select plan_items.sort_order
    into destination_sort_order
    from public.plan_items
    where plan_items.id = p_before_plan_item_id
      and plan_items.owner_id = user_id
      and plan_items.plan_id = selected_plan_id
      and plan_items.id <> p_plan_item_id
      and plan_items.planned_calendar_year is not distinct from
        p_planned_calendar_year
      and plan_items.planned_period_code is not distinct from period_code;

    if destination_sort_order is null then
      raise exception using
        errcode = 'P0002',
        message = 'The requested destination item was not found.';
    end if;

    update public.plan_items
    set sort_order = plan_items.sort_order + 1
    where plan_items.plan_id = selected_plan_id
      and plan_items.owner_id = user_id
      and plan_items.id <> p_plan_item_id
      and plan_items.planned_calendar_year is not distinct from
        p_planned_calendar_year
      and plan_items.planned_period_code is not distinct from period_code
      and plan_items.sort_order >= destination_sort_order;
  else
    select coalesce(max(plan_items.sort_order), -1) + 1
    into destination_sort_order
    from public.plan_items
    where plan_items.plan_id = selected_plan_id
      and plan_items.owner_id = user_id
      and plan_items.id <> p_plan_item_id
      and plan_items.planned_calendar_year is not distinct from
        p_planned_calendar_year
      and plan_items.planned_period_code is not distinct from period_code;
  end if;

  update public.plan_items
  set
    academic_period_id = selected_period_id,
    planned_calendar_year = p_planned_calendar_year,
    planned_period_code = period_code,
    sort_order = destination_sort_order
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id;
end;
$$;

create or replace function public.record_current_user_course_attempt(p_plan_item_id uuid, p_attempt_status text, p_attempt_mark numeric default null::numeric, p_units_attempted numeric default null::numeric) returns uuid
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  user_id uuid := (select auth.uid());
  selected_record_id bigint;
  selected_calendar_year smallint;
  selected_period_code text;
  selected_period_id bigint;
  selected_snapshot_id bigint;
  selected_unit_value_kind text;
  selected_fixed_units numeric(6, 2);
  selected_minimum_units numeric(6, 2);
  selected_maximum_units numeric(6, 2);
  existing_attempt_id uuid;
  existing_snapshot_id bigint;
  existing_attempted_units numeric(5, 2);
  attempted_units numeric(5, 2);
  normalised_mark numeric(5, 2);
  created_attempt_id uuid;
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_attempt_status not in ('enrolled', 'completed', 'failed') then
    raise exception using
      errcode = '22023',
      message = 'Attempt status must be enrolled, completed or failed.';
  end if;

  if p_attempt_mark is not null and (p_attempt_mark < 0 or p_attempt_mark > 100) then
    raise exception using
      errcode = '22023',
      message = 'Attempt mark must be between 0 and 100.';
  end if;

  if p_units_attempted is not null and (
    p_units_attempted <= 0
    or p_units_attempted > 999.99
    or p_units_attempted <> round(p_units_attempted, 2)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Attempted units must be a positive value with at most two decimal places.';
  end if;

  normalised_mark := case
    when p_attempt_status = 'enrolled' then null
    else p_attempt_mark::numeric(5, 2)
  end;

  select
    plan_items.catalogue_record_id,
    plan_items.planned_calendar_year,
    plan_items.planned_period_code
  into
    selected_record_id,
    selected_calendar_year,
    selected_period_code
  from public.plan_items
  join public.plans on plans.id = plan_items.plan_id
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id
    and plans.owner_id = user_id
  for update of plan_items;

  if selected_record_id is null then
    raise exception using errcode = 'P0002', message = 'Plan item not found.';
  end if;

  if selected_calendar_year is null or selected_period_code is null then
    raise exception using
      errcode = '22023',
      message = 'Schedule the course in an academic period before recording an attempt.';
  end if;

  select academic_periods.id
  into selected_period_id
  from public.academic_periods
  where academic_periods.calendar_year = selected_calendar_year
    and academic_periods.code = selected_period_code;

  if selected_period_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The academic period is not available for recorded history.';
  end if;

  select
    course_attempts.id,
    course_attempts.catalogue_version_id,
    course_attempts.units_attempted
  into
    existing_attempt_id,
    existing_snapshot_id,
    existing_attempted_units
  from public.course_attempts
  join public.catalogue_versions as versions
    on versions.id = course_attempts.catalogue_version_id
  where course_attempts.owner_id = user_id
    and versions.record_id = selected_record_id
    and course_attempts.academic_period_id = selected_period_id
  for update;

  if existing_attempt_id is not null then
    if p_units_attempted is not null
      and p_units_attempted <> existing_attempted_units
    then
      raise exception using
        errcode = '22023',
        message = 'Attempted units cannot change after an attempt is recorded.';
    end if;

    selected_snapshot_id := existing_snapshot_id;
    attempted_units := existing_attempted_units;
  else
    select
      item_years.published_version_id,
      details.unit_value_kind,
      details.units,
      details.minimum_units,
      details.maximum_units
    into
      selected_snapshot_id,
      selected_unit_value_kind,
      selected_fixed_units,
      selected_minimum_units,
      selected_maximum_units
    from public.catalogue_records as item_years
    join public.course_version_details as details
      on details.version_id = item_years.published_version_id
    where item_years.id = selected_record_id
      and item_years.archived_at is null;

    if selected_snapshot_id is null then
      raise exception using
        errcode = 'P0002',
        message = 'The course has no published units for the attempted year.';
    end if;

    case selected_unit_value_kind
      when 'fixed' then
        if selected_fixed_units is null or selected_fixed_units <= 0 then
          raise exception using
            errcode = 'P0002',
            message = 'The course has no published units for the attempted year.';
        end if;

        if p_units_attempted is not null
          and p_units_attempted <> selected_fixed_units
        then
          raise exception using
            errcode = '22023',
            message = 'Attempted units must match the fixed course value.';
        end if;

        attempted_units := selected_fixed_units::numeric(5, 2);

      when 'range' then
        if p_units_attempted is null then
          raise exception using
            errcode = '22023',
            message = 'Choose the attempted units for this course.';
        end if;

        if selected_minimum_units is null
          or selected_maximum_units is null
          or selected_minimum_units <= 0
          or p_units_attempted < selected_minimum_units
          or p_units_attempted > selected_maximum_units
        then
          raise exception using
            errcode = '22023',
            message = 'Attempted units must be within the published course range.';
        end if;

        attempted_units := p_units_attempted::numeric(5, 2);

      when 'variable' then
        if p_units_attempted is null then
          raise exception using
            errcode = '22023',
            message = 'Choose the attempted units for this course.';
        end if;

        if not exists (
          select 1
          from public.course_unit_options
          where course_unit_options.version_id = selected_snapshot_id
            and course_unit_options.units = p_units_attempted
        ) then
          raise exception using
            errcode = '22023',
            message = 'Attempted units must match a published course unit option.';
        end if;

        attempted_units := p_units_attempted::numeric(5, 2);

      else
        raise exception using
          errcode = 'P0002',
          message = 'The course has no published units for the attempted year.';
    end case;
  end if;

  insert into public.course_attempts (
    owner_id,
    catalogue_version_id,
    academic_period_id,
    status,
    mark,
    grade,
    units_attempted,
    units_earned,
    source
  ) values (
    user_id,
    selected_snapshot_id,
    selected_period_id,
    p_attempt_status,
    normalised_mark,
    null,
    attempted_units,
    case when p_attempt_status = 'completed' then attempted_units else 0 end,
    'user_entered'
  )
  on conflict (owner_id, catalogue_version_id, academic_period_id) do update
  set
    status = excluded.status,
    mark = excluded.mark,
    grade = null,
    units_earned = case
      when excluded.status = 'completed'
        then course_attempts.units_attempted
      else 0
    end,
    source = 'user_entered',
    updated_at = now()
  where course_attempts.units_attempted = excluded.units_attempted
  returning id into created_attempt_id;

  if created_attempt_id is null then
    raise exception using
      errcode = '22023',
      message = 'Attempted units cannot change after an attempt is recorded.';
  end if;

  delete from public.plan_items
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id;

  return created_attempt_id;
end;
$$;

create or replace function public.remove_current_user_plan_item(p_plan_item_id uuid) returns boolean
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  user_id uuid := (select auth.uid());
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  delete from public.plan_items
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id;

  return found;
end;
$$;

create or replace function public.save_current_user_primary_plan(p_display_name text, p_student_number text, p_academic_year smallint, p_commencement_year smallint, p_study_load text, p_programme_code text, p_major_code text default null::text, p_minor_codes text[] default '{}'::text[], p_specialisation_codes text[] default '{}'::text[]) returns uuid
    language plpgsql
    set search_path to ''
    as $$
declare
  user_id uuid := auth.uid();
  selected_academic_year_id bigint;
  selected_plan_id uuid;
  existing_plan_id uuid;
  selected_programme_year_id bigint;
  selected_programme_snapshot_id bigint;
  selected_programme_units numeric;
  selected_programme_duration_years numeric;
  selected_structure record;
  selected_structure_record_id bigint;
  inserted_structure_count integer;
  expected_structure_count integer;
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if nullif(btrim(p_display_name), '') is null then
    raise exception using errcode = '22023', message = 'Display name is required.';
  end if;

  p_major_code := nullif(upper(btrim(p_major_code)), '');
  p_minor_codes := coalesce(p_minor_codes, '{}'::text[]);
  p_specialisation_codes := coalesce(p_specialisation_codes, '{}'::text[]);

  if exists (
    select 1
    from unnest(p_minor_codes || p_specialisation_codes) as requested(code)
    where nullif(btrim(requested.code), '') is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'Selected minor and specialisation codes cannot be blank.';
  end if;

  select coalesce(array_agg(upper(btrim(requested.code)) order by requested.position), '{}'::text[])
  into p_minor_codes
  from unnest(p_minor_codes) with ordinality as requested(code, position);

  select coalesce(array_agg(upper(btrim(requested.code)) order by requested.position), '{}'::text[])
  into p_specialisation_codes
  from unnest(p_specialisation_codes) with ordinality as requested(code, position);

  if exists (
    select 1
    from (
      select p_major_code as code where p_major_code is not null
      union all
      select code from unnest(p_minor_codes) as minors(code)
      union all
      select code from unnest(p_specialisation_codes) as specialisations(code)
    ) as requested
    group by requested.code
    having count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'Select each academic structure only once.';
  end if;

  select years.id
  into selected_academic_year_id
  from public.academic_years as years
  where years.year = p_academic_year;
  if selected_academic_year_id is null then
    raise exception using errcode = 'P0002', message = 'The selected academic year is not available.';
  end if;

  select
    item_years.id,
    item_years.published_version_id,
    details.units,
    details.duration_years
  into
    selected_programme_year_id,
    selected_programme_snapshot_id,
    selected_programme_units,
    selected_programme_duration_years
  from public.catalogue_records as item_years
  join public.catalogue_codes as items on items.id = item_years.code_id
  join public.structure_version_details as details
    on details.version_id = item_years.published_version_id
  where items.code = upper(btrim(p_programme_code))
    and items.kind = 'programme'
    and item_years.academic_year_id = selected_academic_year_id
    and item_years.archived_at is null
    and item_years.published_version_id is not null
  limit 1;
  if selected_programme_year_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The selected programme is not published for that academic year.';
  end if;
  if selected_programme_units is null
     and selected_programme_duration_years is null then
    raise exception using
      errcode = '22023',
      message = 'The selected programme does not include duration or unit information for planning.';
  end if;

  for selected_structure in
    select 'major'::text as role, p_major_code as code, 1::integer as position
    where p_major_code is not null
    union all
    select
      'minor'::text,
      requested.code,
      requested.position::integer + case when p_major_code is null then 0 else 1 end
    from unnest(p_minor_codes) with ordinality as requested(code, position)
    union all
    select
      'specialisation'::text,
      requested.code,
      requested.position::integer
        + case when p_major_code is null then 0 else 1 end
        + cardinality(p_minor_codes)
    from unnest(p_specialisation_codes) with ordinality as requested(code, position)
    order by position
  loop
    selected_structure_record_id := null;

    select item_years.id
    into selected_structure_record_id
    from public.catalogue_records as item_years
    join public.catalogue_codes as items on items.id = item_years.code_id
    where items.code = selected_structure.code
      and items.kind = selected_structure.role
      and item_years.academic_year_id = selected_academic_year_id
      and item_years.archived_at is null
      and item_years.published_version_id is not null
    limit 1;

    if selected_structure_record_id is null then
      raise exception using
        errcode = 'P0002',
        message = format(
          'The selected %s is not published for that academic year.',
          selected_structure.role
        );
    end if;

    if not private.programme_offers_structure(
      selected_programme_snapshot_id,
      selected_structure.role,
      selected_structure.code
    ) then
      raise exception using
        errcode = '22023',
        message = format(
          'The selected %s is not an explicit option for that programme.',
          selected_structure.role
        );
    end if;
  end loop;

  update public.profiles
  set
    display_name = btrim(p_display_name),
    student_number = nullif(lower(btrim(p_student_number)), '')
  where id = user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The authenticated profile is missing.';
  end if;

  select plans.id
  into existing_plan_id
  from public.plans
  where plans.owner_id = user_id and plans.is_primary
  for update;

  if existing_plan_id is not null then
    delete from public.plan_structures
    where plan_id = existing_plan_id and owner_id = user_id;
  end if;

  insert into public.plans (
    owner_id,
    academic_year_id,
    name,
    is_primary,
    status,
    commencement_year,
    study_load
  ) values (
    user_id,
    selected_academic_year_id,
    upper(btrim(p_programme_code)) || ' plan',
    true,
    'active',
    p_commencement_year,
    p_study_load
  )
  on conflict (owner_id) where is_primary do update
  set
    academic_year_id = excluded.academic_year_id,
    name = excluded.name,
    status = 'active',
    commencement_year = excluded.commencement_year,
    study_load = excluded.study_load,
    updated_at = now()
  returning id into selected_plan_id;

  insert into public.plan_structures (
    plan_id, owner_id, catalogue_record_id, role, position
  ) values (
    selected_plan_id, user_id, selected_programme_year_id, 'programme', 0
  );

  insert into public.plan_structures (
    plan_id, owner_id, catalogue_record_id, role, position
  )
  select
    selected_plan_id,
    user_id,
    item_years.id,
    requested.role,
    requested.position
  from (
    select 'major'::text as role, p_major_code as code, 1::integer as position
    where p_major_code is not null
    union all
    select
      'minor'::text,
      minors.code,
      minors.position::integer + case when p_major_code is null then 0 else 1 end
    from unnest(p_minor_codes) with ordinality as minors(code, position)
    union all
    select
      'specialisation'::text,
      specialisations.code,
      specialisations.position::integer
        + case when p_major_code is null then 0 else 1 end
        + cardinality(p_minor_codes)
    from unnest(p_specialisation_codes) with ordinality as specialisations(code, position)
  ) as requested
  join public.catalogue_codes as items
    on items.code = requested.code
   and items.kind = requested.role
  join public.catalogue_records as item_years
    on item_years.code_id = items.id
   and item_years.academic_year_id = selected_academic_year_id
   and item_years.archived_at is null
   and item_years.published_version_id is not null
  order by requested.position;

  get diagnostics inserted_structure_count = row_count;
  expected_structure_count :=
    case when p_major_code is null then 0 else 1 end
    + cardinality(p_minor_codes)
    + cardinality(p_specialisation_codes);

  if inserted_structure_count <> expected_structure_count then
    raise exception using
      errcode = '40001',
      message = 'A selected academic structure changed while the plan was being saved. Please try again.';
  end if;

  return selected_plan_id;
end;
$$;

create or replace function public.set_current_user_plan_extension_years(p_extension_years smallint) returns void
    language plpgsql
    set search_path to ''
    as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'You must be signed in to update a plan.';
  end if;

  if p_extension_years is null
    or p_extension_years < 0
    or p_extension_years > 10 then
    raise exception using
      errcode = '22023',
      message = 'Plan extensions must be between zero and ten years.';
  end if;

  update public.plans
  set extension_years = p_extension_years,
      updated_at = now()
  where owner_id = v_user_id
    and is_primary
    and status = 'active';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Your primary plan was not found.';
  end if;
end;
$$;

create or replace function public.save_current_user_academic_result(p_id uuid, p_operation text default 'save'::text, p_mark numeric default null::numeric, p_grade text default null::text, p_units numeric default null::numeric) returns uuid
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  owner uuid := auth.uid();
  target uuid;
  result_status text;
  result_mark numeric := p_mark;
  result_grade text := nullif(p_grade, '');
begin
  if owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_operation is null or p_operation not in ('save', 'clear', 'remove') then
    raise exception 'The result operation is invalid.' using errcode = '22023';
  end if;
  select id into target
  from public.course_attempts
  where id = p_id and owner_id = owner
  for update;
  if p_operation = 'remove' then
    if target is not null then
      delete from public.course_attempts where id = target and owner_id = owner;
    elsif not public.remove_current_user_plan_item(p_id) then
      raise exception 'The course was not found.' using errcode = '42501';
    end if;
    return p_id;
  end if;
  if p_operation = 'clear' then
    if target is null then
      raise exception 'The result was not found.' using errcode = '42501';
    end if;
    update public.course_attempts
    set status = 'enrolled', mark = null, grade = null, units_earned = 0
    where id = target and owner_id = owner;
    return target;
  end if;
  if result_grade is not null and result_grade not in (
    'PS', 'NCN', 'CRS', 'CRN', 'HLP', 'WD', 'WL', 'WN', 'DA', 'PX', 'RP', 'WA',
    'WF', 'KU', 'RC', 'STE', 'STI', 'EE'
  ) then
    raise exception 'The result code is invalid.' using errcode = '22023';
  end if;
  if result_grade = 'PS' then
    result_mark := 50;
  elsif result_grade = 'NCN' then
    result_mark := coalesce(result_mark, 0);
  elsif result_grade is not null then
    result_mark := null;
  end if;
  if (result_grade is null and result_mark is null)
    or result_mark < 0
    or result_mark > 100
    or result_mark::text in ('NaN', 'Infinity', '-Infinity')
    or result_mark <> round(result_mark, 2)
  then
    raise exception
      'The mark must be between 0 and 100 with up to two decimal places.'
      using errcode = '22023';
  end if;
  result_status := case
    when result_grade in ('NCN', 'WN', 'CRN') then 'failed'
    when result_grade in ('PS', 'CRS', 'HLP') then 'completed'
    when result_grade in ('WD', 'WL', 'STE', 'STI', 'EE') then 'withdrawn'
    when result_grade is not null then 'enrolled'
    when result_mark >= 50 then 'completed'
    else 'failed'
  end;
  if target is null then
    target := public.record_current_user_course_attempt(
      p_id,
      case when result_status = 'withdrawn' then 'enrolled' else result_status end,
      result_mark,
      p_units
    );
  end if;
  update public.course_attempts
  set
    status = result_status,
    mark = result_mark,
    grade = result_grade,
    units_earned = case when result_status = 'completed' then units_attempted else 0 end
  where id = target and owner_id = owner;
  return target;
end;
$$;

create or replace trigger approval_requests_append_created_event after insert on public.approval_requests for each row execute function private.append_approval_created_event();

create or replace trigger approval_requests_append_resolution_event after update OF status on public.approval_requests for each row when ((old.status is distinct from new.status)) execute function private.append_approval_resolution_event();

create or replace trigger approval_requests_prepare_resolution before update on public.approval_requests for each row execute function private.prepare_approval_resolution();

create or replace trigger approval_requests_set_updated_at before update on public.approval_requests for each row execute function private.set_updated_at();

create or replace trigger course_attempts_enforce_snapshot_lineage before insert or update OF catalogue_version_id, academic_period_id on public.course_attempts for each row execute function private.enforce_course_attempt_snapshot_lineage();

create or replace trigger course_attempts_set_updated_at before update on public.course_attempts for each row execute function private.set_updated_at();

create or replace trigger plan_items_require_active_course_year before insert or update OF catalogue_record_id on public.plan_items for each row execute function private.require_active_plan_item_course_year();

create or replace trigger plan_items_set_updated_at before update on public.plan_items for each row execute function private.set_updated_at();

create or replace trigger plan_structures_set_updated_at before update on public.plan_structures for each row execute function private.set_updated_at();

create or replace trigger plan_structures_validate_kind before insert or update OF catalogue_record_id, role on public.plan_structures for each row execute function private.validate_plan_structure_kind();

create or replace trigger plans_set_updated_at before update on public.plans for each row execute function private.set_updated_at();

alter table public.approval_events enable row level security;

alter table public.approval_requests enable row level security;

alter table public.course_attempts enable row level security;

alter table public.plan_items enable row level security;

alter table public.plan_structures enable row level security;

alter table public.plans enable row level security;

create policy academic_structure_fees_read on public.academic_structure_fees for select to authenticated, anon using (( select private.can_read_version(academic_structure_fees.version_id) as can_read_version));

create policy academic_structure_learning_outcomes_read on public.academic_structure_learning_outcomes for select to authenticated, anon using (( select private.can_read_version(academic_structure_learning_outcomes.version_id) as can_read_version));

create policy academic_structure_snapshot_relationships_read on public.academic_structure_snapshot_relationships for select to authenticated, anon using (( select private.can_read_version(academic_structure_snapshot_relationships.version_id) as can_read_version));

create policy academic_structure_snapshot_sections_read on public.academic_structure_snapshot_sections for select to authenticated, anon using (( select private.can_read_version(academic_structure_snapshot_sections.version_id) as can_read_version));

create policy approval_events_owner_select on public.approval_events for select to authenticated using ((( select auth.uid() as uid) = owner_id));

create policy approval_events_reviewer_select on public.approval_events for select to authenticated using (( select private.has_permission('approvals.review'::text) as has_permission));

create policy approval_requests_owner_insert on public.approval_requests for insert to authenticated with check (((( select auth.uid() as uid) = owner_id) and (status = 'pending'::text) and (decision_note is null) and (resolved_by is null) and (resolved_at is null)));

create policy approval_requests_owner_select on public.approval_requests for select to authenticated using ((( select auth.uid() as uid) = owner_id));

create policy approval_requests_reviewer_select on public.approval_requests for select to authenticated using (( select private.has_permission('approvals.review'::text) as has_permission));

create policy approval_requests_reviewer_update on public.approval_requests for update to authenticated using (( select private.has_permission('approvals.review'::text) as has_permission)) with check (( select private.has_permission('approvals.review'::text) as has_permission));

create policy catalogue_codes_read on public.catalogue_codes for select to authenticated, anon using (( select private.can_read_catalogue_item(catalogue_codes.id) as can_read_catalogue_item));

create policy catalogue_records_read on public.catalogue_records for select to authenticated, anon using ((((published_version_id is not null) and (archived_at is null)) or ( select private.can_read_catalogue_drafts() as can_read_catalogue_drafts) or ( select private.can_read_catalogue_item(catalogue_records.code_id) as can_read_catalogue_item)));

create policy catalogue_version_provenance_read on public.catalogue_version_provenance for select to authenticated, anon using (( select private.can_read_version(catalogue_version_provenance.version_id) as can_read_version));

create policy catalogue_versions_read on public.catalogue_versions for select to authenticated, anon using (( select private.can_read_version(catalogue_versions.id) as can_read_version));

create policy course_areas_of_interest_read on public.course_areas_of_interest for select to authenticated, anon using (( select private.can_read_version(course_areas_of_interest.version_id) as can_read_version));

create policy course_assessment_items_read on public.course_assessment_items for select to authenticated, anon using (( select private.can_read_version(course_assessment_items.version_id) as can_read_version));

create policy course_assessment_outcomes_read on public.course_assessment_outcomes for select to authenticated, anon using (( select private.can_read_version(course_assessment_outcomes.version_id) as can_read_version));

create policy course_attempts_owner_or_admin_select on public.course_attempts for select to authenticated using (((( select auth.uid() as uid) = owner_id) or ( select private.has_permission('admin.access'::text) as has_permission)));

create policy course_attributes_read on public.course_attributes for select to authenticated, anon using (( select private.can_read_version(course_attributes.version_id) as can_read_version));

create policy course_fees_read on public.course_fees for select to authenticated, anon using (( select private.can_read_version(course_fees.version_id) as can_read_version));

create policy course_learning_outcomes_read on public.course_learning_outcomes for select to authenticated, anon using (( select private.can_read_version(course_learning_outcomes.version_id) as can_read_version));

create policy course_offerings_read on public.course_offerings for select to authenticated, anon using (( select private.can_read_version(course_offerings.version_id) as can_read_version));

create policy course_related_courses_read on public.course_related_courses for select to authenticated, anon using (( select private.can_read_version(course_related_courses.version_id) as can_read_version));

create policy course_unit_options_read on public.course_unit_options for select to authenticated, anon using (( select private.can_read_version(course_unit_options.version_id) as can_read_version));

create policy course_version_details_read on public.course_version_details for select to authenticated, anon using (( select private.can_read_version(course_version_details.version_id) as can_read_version));

create policy offering_sessions_read on public.offering_sessions for select to authenticated, anon using (( select private.can_read_version(offering_sessions.version_id) as can_read_version));

create policy plan_items_owner_or_admin_select on public.plan_items for select to authenticated using (((( select auth.uid() as uid) = owner_id) or ( select private.has_permission('admin.access'::text) as has_permission)));

create policy plan_structures_owner_delete on public.plan_structures for delete to authenticated using ((( select auth.uid() as uid) = owner_id));

create policy plan_structures_owner_insert on public.plan_structures for insert to authenticated with check ((( select auth.uid() as uid) = owner_id));

create policy plan_structures_owner_or_admin_select on public.plan_structures for select to authenticated using (((( select auth.uid() as uid) = owner_id) or ( select private.has_permission('admin.access'::text) as has_permission)));

create policy plan_structures_owner_update on public.plan_structures for update to authenticated using ((( select auth.uid() as uid) = owner_id)) with check ((( select auth.uid() as uid) = owner_id));

create policy plans_owner_delete on public.plans for delete to authenticated using ((( select auth.uid() as uid) = owner_id));

create policy plans_owner_insert on public.plans for insert to authenticated with check ((( select auth.uid() as uid) = owner_id));

create policy plans_owner_or_admin_select on public.plans for select to authenticated using (((( select auth.uid() as uid) = owner_id) or ( select private.has_permission('admin.access'::text) as has_permission)));

create policy plans_owner_update on public.plans for update to authenticated using ((( select auth.uid() as uid) = owner_id)) with check ((( select auth.uid() as uid) = owner_id));

create policy requirement_condition_options_read on public.requirement_condition_options for select to authenticated, anon using (( select private.can_read_version(requirement_condition_options.version_id) as can_read_version));

create policy requirement_conditions_read on public.requirement_conditions for select to authenticated, anon using (( select private.can_read_version(requirement_conditions.version_id) as can_read_version));

create policy requirement_groups_read on public.requirement_groups for select to authenticated, anon using (( select private.can_read_version(requirement_groups.version_id) as can_read_version));

create policy requirement_item_references_read on public.requirement_item_references for select to authenticated, anon using (( select private.can_read_version(requirement_item_references.version_id) as can_read_version));

create policy requirement_rules_read on public.requirement_rules for select to authenticated, anon using (( select private.can_read_version(requirement_rules.version_id) as can_read_version));

create policy structure_snapshot_summary_fields_read on public.structure_snapshot_summary_fields for select to authenticated, anon using (( select private.can_read_version(structure_snapshot_summary_fields.version_id) as can_read_version));

create policy structure_version_details_read on public.structure_version_details for select to authenticated, anon using (( select private.can_read_version(structure_version_details.version_id) as can_read_version));

-- Every object is taken back to nothing before it is granted anything, so the
-- grants below are the whole of what each role holds rather than an addition
-- to whatever Supabase's defaults already handed out.

revoke all on function private.append_approval_created_event() from public, anon, authenticated, service_role;

revoke all on function private.append_approval_resolution_event() from public, anon, authenticated, service_role;

revoke all on function private.can_read_catalogue_item(p_item_id bigint) from public, anon, authenticated, service_role;

revoke all on function private.can_read_version(p_version_id bigint) from public, anon, authenticated, service_role;

revoke all on function private.enforce_course_attempt_snapshot_lineage() from public, anon, authenticated, service_role;

revoke all on function private.prepare_approval_resolution() from public, anon, authenticated, service_role;

revoke all on function private.require_active_plan_item_course_year() from public, anon, authenticated, service_role;

revoke all on function private.validate_plan_structure_kind() from public, anon, authenticated, service_role;

revoke all on function public.add_current_user_plan_item(p_course_code text, p_academic_year smallint, p_planned_calendar_year smallint, p_planned_period_code text) from public, anon, authenticated, service_role;

revoke all on function public.current_user_course_attempt_version_projections(p_version_ids bigint[]) from public, anon, authenticated, service_role;

revoke all on function public.move_current_user_plan_item(p_plan_item_id uuid, p_planned_calendar_year smallint, p_planned_period_code text, p_before_plan_item_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.record_current_user_course_attempt(p_plan_item_id uuid, p_attempt_status text, p_attempt_mark numeric, p_units_attempted numeric) from public, anon, authenticated, service_role;

revoke all on function public.remove_current_user_plan_item(p_plan_item_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.save_current_user_academic_result(p_id uuid, p_operation text, p_mark numeric, p_grade text, p_units numeric) from public, anon, authenticated, service_role;

revoke all on function public.save_current_user_primary_plan(p_display_name text, p_student_number text, p_academic_year smallint, p_commencement_year smallint, p_study_load text, p_programme_code text, p_major_code text, p_minor_codes text[], p_specialisation_codes text[]) from public, anon, authenticated, service_role;

revoke all on function public.set_current_user_plan_extension_years(p_extension_years smallint) from public, anon, authenticated, service_role;

revoke all on table public.approval_events from public, anon, authenticated, service_role;

revoke all on sequence public.approval_events_id_seq from public, anon, authenticated, service_role;

revoke all on table public.approval_requests from public, anon, authenticated, service_role;

revoke all on table public.course_attempts from public, anon, authenticated, service_role;

revoke all on table public.plan_items from public, anon, authenticated, service_role;

revoke all on table public.plan_structures from public, anon, authenticated, service_role;

revoke all on table public.plans from public, anon, authenticated, service_role;

revoke all on function private.append_approval_created_event() from public;

revoke all on function private.append_approval_resolution_event() from public;

revoke all on function private.can_read_catalogue_item(p_item_id bigint) from public;

grant all on function private.can_read_catalogue_item(p_item_id bigint) to anon;

grant all on function private.can_read_catalogue_item(p_item_id bigint) to authenticated;

revoke all on function private.can_read_version(p_version_id bigint) from public;

grant all on function private.can_read_version(p_version_id bigint) to anon;

grant all on function private.can_read_version(p_version_id bigint) to authenticated;

revoke all on function private.enforce_course_attempt_snapshot_lineage() from public;

revoke all on function private.prepare_approval_resolution() from public;

revoke all on function private.require_active_plan_item_course_year() from public;

revoke all on function private.validate_plan_structure_kind() from public;

revoke all on function public.add_current_user_plan_item(p_course_code text, p_academic_year smallint, p_planned_calendar_year smallint, p_planned_period_code text) from public;

grant all on function public.add_current_user_plan_item(p_course_code text, p_academic_year smallint, p_planned_calendar_year smallint, p_planned_period_code text) to authenticated;

grant all on function public.add_current_user_plan_item(p_course_code text, p_academic_year smallint, p_planned_calendar_year smallint, p_planned_period_code text) to service_role;

revoke all on function public.current_user_course_attempt_version_projections(p_version_ids bigint[]) from public;

grant all on function public.current_user_course_attempt_version_projections(p_version_ids bigint[]) to authenticated;

grant all on function public.current_user_course_attempt_version_projections(p_version_ids bigint[]) to service_role;

revoke all on function public.move_current_user_plan_item(p_plan_item_id uuid, p_planned_calendar_year smallint, p_planned_period_code text, p_before_plan_item_id uuid) from public;

grant all on function public.move_current_user_plan_item(p_plan_item_id uuid, p_planned_calendar_year smallint, p_planned_period_code text, p_before_plan_item_id uuid) to authenticated;

revoke all on function public.record_current_user_course_attempt(p_plan_item_id uuid, p_attempt_status text, p_attempt_mark numeric, p_units_attempted numeric) from public;

grant all on function public.record_current_user_course_attempt(p_plan_item_id uuid, p_attempt_status text, p_attempt_mark numeric, p_units_attempted numeric) to authenticated;

grant all on function public.record_current_user_course_attempt(p_plan_item_id uuid, p_attempt_status text, p_attempt_mark numeric, p_units_attempted numeric) to service_role;

revoke all on function public.remove_current_user_plan_item(p_plan_item_id uuid) from public;

grant all on function public.remove_current_user_plan_item(p_plan_item_id uuid) to authenticated;

revoke all on function public.save_current_user_academic_result(p_id uuid, p_operation text, p_mark numeric, p_grade text, p_units numeric) from public;

grant all on function public.save_current_user_academic_result(p_id uuid, p_operation text, p_mark numeric, p_grade text, p_units numeric) to authenticated;

grant all on function public.save_current_user_academic_result(p_id uuid, p_operation text, p_mark numeric, p_grade text, p_units numeric) to service_role;

revoke all on function public.save_current_user_primary_plan(p_display_name text, p_student_number text, p_academic_year smallint, p_commencement_year smallint, p_study_load text, p_programme_code text, p_major_code text, p_minor_codes text[], p_specialisation_codes text[]) from public;

grant all on function public.save_current_user_primary_plan(p_display_name text, p_student_number text, p_academic_year smallint, p_commencement_year smallint, p_study_load text, p_programme_code text, p_major_code text, p_minor_codes text[], p_specialisation_codes text[]) to authenticated;

grant all on function public.save_current_user_primary_plan(p_display_name text, p_student_number text, p_academic_year smallint, p_commencement_year smallint, p_study_load text, p_programme_code text, p_major_code text, p_minor_codes text[], p_specialisation_codes text[]) to service_role;

revoke all on function public.set_current_user_plan_extension_years(p_extension_years smallint) from public;

grant all on function public.set_current_user_plan_extension_years(p_extension_years smallint) to authenticated;

grant all on table public.approval_events to service_role;

grant select on table public.approval_events to authenticated;

grant all on sequence public.approval_events_id_seq to service_role;

grant all on table public.approval_requests to service_role;

grant select on table public.approval_requests to authenticated;

grant insert(owner_id) on table public.approval_requests to authenticated;

grant insert(plan_item_id) on table public.approval_requests to authenticated;

grant insert(academic_period_id) on table public.approval_requests to authenticated;

grant insert(request_kind) on table public.approval_requests to authenticated;

grant update(status) on table public.approval_requests to authenticated;

grant insert(reason) on table public.approval_requests to authenticated;

grant update(decision_note) on table public.approval_requests to authenticated;

grant all on table public.course_attempts to service_role;

grant select on table public.course_attempts to authenticated;

grant all on table public.plan_items to service_role;

grant select on table public.plan_items to authenticated;

grant all on table public.plan_structures to service_role;

grant select,insert,delete,update on table public.plan_structures to authenticated;

grant all on table public.plans to service_role;

grant select,insert,delete,update on table public.plans to authenticated;
