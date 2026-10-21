-- Explicit course alternatives may join a subject and level unit pool.
-- Each option contributes ordinary earned credit once, without a repeat allowance.
create or replace function private.validate_requirement_condition_option() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if not exists (
    select 1
    from public.requirement_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.condition_kind in ('course_set_units', 'consecutive_semester_pair', 'structure_set', 'gpa', 'wam', 'filtered_units')
  ) then
    raise exception 'requirement options belong to course_set_units, consecutive_semester_pair, structure_set, gpa, wam or filtered_units conditions'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.requirement_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.condition_kind = 'consecutive_semester_pair'
  ) and (new.kind <> 'course' or new.position not in (1, 2)) then
    raise exception 'consecutive semester pair options must be ordered courses at positions 1 and 2'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.requirement_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.condition_kind in ('gpa', 'wam')
  ) and (new.kind <> 'course' or new.maximum_units is not null) then
    raise exception 'a grade average is scoped to courses without a repeat allowance'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.requirement_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.condition_kind = 'filtered_units'
  ) and (new.kind <> 'course' or new.maximum_units is not null) then
    raise exception 'filtered unit alternatives must be courses without a repeat allowance'
      using errcode = '23514';
  end if;

  if new.maximum_units is not null and not exists (
    select 1
    from public.requirement_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.condition_kind = 'course_set_units'
      and (conditions.maximum_units is null or new.maximum_units <= conditions.maximum_units)
  ) then
    raise exception 'a repeatable course belongs to a course list and fits within its maximum units'
      using errcode = '23514';
  end if;

  if new.code_id is not null and not exists (
    select 1 from public.catalogue_codes
    where id = new.code_id and kind = new.kind and code = new.code
  ) then
    raise exception 'requirement option item does not match its code'
      using errcode = '23503';
  end if;

  return new;
end;
$$;
