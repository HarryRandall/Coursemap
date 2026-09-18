-- Fixture builders for the shared catalogue model. Each function creates the
-- identity and item year on demand, assembles a snapshot with its details row
-- and returns the snapshot id. publish_* also sets the published pointer,
-- which seals the snapshot.

create function pg_temp.catalogue_item_year(p_kind text, p_code text, p_year smallint)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  selected_item_id bigint;
  selected_year_id bigint;
  selected_item_year_id bigint;
begin
  insert into public.academic_years (year)
  values (p_year)
  on conflict (year) do nothing;

  insert into public.catalogue_items (kind, code)
  values (p_kind, p_code)
  on conflict (kind, code) do nothing;

  select items.id into selected_item_id
  from public.catalogue_items as items
  where items.kind = p_kind and items.code = p_code;

  select years.id into selected_year_id
  from public.academic_years as years
  where years.year = p_year;

  insert into public.catalogue_item_years (item_id, kind, academic_year_id)
  values (selected_item_id, p_kind, selected_year_id)
  on conflict (item_id, academic_year_id) do nothing;

  select item_years.id into selected_item_year_id
  from public.catalogue_item_years as item_years
  where item_years.item_id = selected_item_id
    and item_years.academic_year_id = selected_year_id;

  return selected_item_year_id;
end;
$$;

create function pg_temp.create_course_snapshot(
  p_code text,
  p_year smallint,
  p_title text default 'Fixture course',
  p_unit_value_kind text default 'fixed',
  p_units numeric default 6,
  p_minimum_units numeric default null,
  p_maximum_units numeric default null,
  p_level smallint default 1000
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  selected_item_year_id bigint := pg_temp.catalogue_item_year('course', p_code, p_year);
  created_snapshot_id bigint;
begin
  insert into public.catalogue_snapshots (
    item_year_id, kind, academic_year_id, origin, content_hash
  )
  select
    selected_item_year_id,
    'course',
    item_years.academic_year_id,
    'manual',
    md5(p_code || ':' || p_year::text || ':' || clock_timestamp()::text)
      || md5(p_title)
  from public.catalogue_item_years as item_years
  where item_years.id = selected_item_year_id
  returning id into created_snapshot_id;

  insert into public.course_snapshot_details (
    snapshot_id, title, unit_value_kind, units, minimum_units, maximum_units,
    level, subject_code, offering_status
  ) values (
    created_snapshot_id, p_title, p_unit_value_kind, p_units, p_minimum_units,
    p_maximum_units, p_level, left(p_code, 4), 'offered'
  );

  return created_snapshot_id;
end;
$$;

create function pg_temp.publish_snapshot(p_snapshot_id bigint)
returns bigint
language plpgsql
set search_path = ''
as $$
begin
  update public.catalogue_item_years as item_years
  set published_snapshot_id = p_snapshot_id
  from public.catalogue_snapshots as snapshots
  where snapshots.id = p_snapshot_id
    and item_years.id = snapshots.item_year_id;
  return p_snapshot_id;
end;
$$;

create function pg_temp.publish_course(
  p_code text,
  p_year smallint,
  p_title text default 'Fixture course',
  p_unit_value_kind text default 'fixed',
  p_units numeric default 6,
  p_minimum_units numeric default null,
  p_maximum_units numeric default null,
  p_level smallint default 1000
)
returns bigint
language sql
set search_path = ''
as $$
  select pg_temp.publish_snapshot(
    pg_temp.create_course_snapshot(
      p_code, p_year, p_title, p_unit_value_kind, p_units,
      p_minimum_units, p_maximum_units, p_level
    )
  );
$$;

create function pg_temp.create_structure_snapshot(
  p_kind text,
  p_code text,
  p_year smallint,
  p_name text default 'Fixture structure',
  p_units numeric default 144,
  p_duration_years numeric default 3
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  selected_item_year_id bigint := pg_temp.catalogue_item_year(p_kind, p_code, p_year);
  created_snapshot_id bigint;
begin
  insert into public.catalogue_snapshots (
    item_year_id, kind, academic_year_id, origin, content_hash
  )
  select
    selected_item_year_id,
    p_kind,
    item_years.academic_year_id,
    'manual',
    md5(p_code || ':' || p_year::text || ':' || clock_timestamp()::text)
      || md5(p_name)
  from public.catalogue_item_years as item_years
  where item_years.id = selected_item_year_id
  returning id into created_snapshot_id;

  insert into public.structure_snapshot_details (
    snapshot_id, kind, name, units, duration_years
  ) values (created_snapshot_id, p_kind, p_name, p_units, p_duration_years);

  return created_snapshot_id;
end;
$$;

create function pg_temp.publish_structure(
  p_kind text,
  p_code text,
  p_year smallint,
  p_name text default 'Fixture structure',
  p_units numeric default 144,
  p_duration_years numeric default 3
)
returns bigint
language sql
set search_path = ''
as $$
  select pg_temp.publish_snapshot(
    pg_temp.create_structure_snapshot(
      p_kind, p_code, p_year, p_name, p_units, p_duration_years
    )
  );
$$;
