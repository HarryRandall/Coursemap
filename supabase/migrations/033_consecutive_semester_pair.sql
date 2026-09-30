alter table public.requirement_conditions
  drop constraint requirement_conditions_kind_check,
  drop constraint requirement_conditions_typed_value_check,
  add constraint requirement_conditions_kind_check check ((condition_kind = any (array['course'::text, 'incompatible'::text, 'incompatible_concurrent'::text, 'structure'::text, 'structure_set'::text, 'course_set_units'::text, 'consecutive_semester_pair'::text, 'units_total'::text, 'subject_units'::text, 'subject_courses'::text, 'level_units'::text, 'tagged_units'::text, 'elective_units'::text, 'year_standing'::text, 'commencement_year'::text, 'enrolment_mode'::text, 'college_enrolment'::text, 'gpa'::text, 'wam'::text, 'permission'::text, 'other'::text]))),
  add constraint requirement_conditions_typed_value_check check (
case condition_kind
    when 'course'::text then (code_id is not null)
    when 'incompatible'::text then (code_id is not null)
    when 'incompatible_concurrent'::text then (code_id is not null)
    when 'structure'::text then ((code_id is not null) or (free_text is not null))
    when 'structure_set'::text then (structure_kind is not null)
    when 'course_set_units'::text then ((minimum_units is not null) or (maximum_units is not null) or (minimum_count is not null))
    when 'consecutive_semester_pair'::text then (minimum_units is not null and (maximum_units is null or maximum_units = minimum_units) and free_text is not null and btrim(free_text) <> '')
    when 'units_total'::text then ((minimum_units is not null) or (maximum_units is not null))
    when 'subject_courses'::text then (subject_code is not null and minimum_count is not null and minimum_units is null and maximum_units is null)
    when 'subject_units'::text then ((subject_code is not null) and ((minimum_units is not null) or (maximum_units is not null)))
    when 'level_units'::text then ((minimum_level is not null) and ((minimum_units is not null) or (maximum_units is not null)))
    when 'tagged_units'::text then ((tag is not null) and ((minimum_units is not null) or (maximum_units is not null)))
    when 'elective_units'::text then ((minimum_units is not null) or (maximum_units is not null))
    when 'enrolment_mode'::text then (enrolment_mode is not null and matches_enrolment_mode is not null)
    when 'commencement_year'::text then (minimum_commencement_year is not null or maximum_commencement_year is not null)
    when 'year_standing'::text then (minimum_year is not null)
    when 'gpa'::text then (minimum_gpa is not null)
    when 'wam'::text then (minimum_wam is not null)
    when 'college_enrolment'::text then (free_text is not null and btrim(free_text) <> '')
    when 'permission'::text then (free_text is not null)
    when 'other'::text then (free_text is not null)
    else null::boolean
end);

create or replace function private.validate_requirement_condition_option() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if not exists (
    select 1
    from public.requirement_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.condition_kind in ('course_set_units', 'consecutive_semester_pair', 'structure_set')
  ) then
    raise exception 'requirement options belong to course_set_units, consecutive_semester_pair or structure_set conditions'
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
