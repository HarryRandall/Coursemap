-- A planned course follows the year it is placed in.
--
-- Placing or moving a course into a period in another academic year swaps the
-- plan item to that year's version of the course, so a 2026 course dropped
-- into 2025 becomes the 2025 course. It is refused only when that year's
-- version has not been imported and published yet. Recorded attempts leave the
-- plan, so only planned courses change version here.

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
  course_code text := upper(btrim(p_course_code));
  course_year smallint := coalesce(p_planned_calendar_year, p_academic_year);
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
    and items.code = course_code
    and academic_years.year = course_year
    and item_years.archived_at is null
    and item_years.published_version_id is not null
  limit 1;

  if selected_record_id is null then
    raise exception using
      errcode = 'P0002',
      message = format('%s for %s isn''t imported yet.', course_code, course_year);
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

create or replace function public.move_current_user_plan_item(p_plan_item_id uuid, p_planned_calendar_year smallint default null::smallint, p_planned_period_code text default null::text, p_before_plan_item_id uuid default null::uuid) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  user_id uuid := (select auth.uid());
  selected_plan_id uuid;
  selected_academic_year smallint;
  selected_code_id bigint;
  selected_course_code text;
  selected_record_id bigint;
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

  select
    plan_items.plan_id,
    plan_items.catalogue_record_id,
    academic_years.year,
    catalogue_codes.id,
    catalogue_codes.code
  into
    selected_plan_id,
    selected_record_id,
    selected_academic_year,
    selected_code_id,
    selected_course_code
  from public.plan_items
  join public.catalogue_records
    on catalogue_records.id = plan_items.catalogue_record_id
  join public.catalogue_codes
    on catalogue_codes.id = catalogue_records.code_id
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
    selected_record_id := null;

    select item_years.id
    into selected_record_id
    from public.catalogue_records as item_years
    join public.academic_years
      on academic_years.id = item_years.academic_year_id
    where item_years.code_id = selected_code_id
      and item_years.kind = 'course'
      and academic_years.year = p_planned_calendar_year
      and item_years.archived_at is null
      and item_years.published_version_id is not null
    limit 1;

    if selected_record_id is null then
      raise exception using
        errcode = 'P0002',
        message = format(
          '%s for %s isn''t imported yet.',
          selected_course_code,
          p_planned_calendar_year
        );
    end if;
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
    catalogue_record_id = selected_record_id,
    academic_period_id = selected_period_id,
    planned_calendar_year = p_planned_calendar_year,
    planned_period_code = period_code,
    sort_order = destination_sort_order
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id;
end;
$$;
