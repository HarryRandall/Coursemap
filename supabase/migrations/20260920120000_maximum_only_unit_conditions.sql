-- Allow a unit-bearing requirement condition to carry only a maximum.
--
-- requirement_conditions_typed_value_check required minimum_units on
-- level_units, subject_units, tagged_units, elective_units and units_total, so
-- a ceiling with no floor could not be stored. ANU states exactly that shape:
-- "A maximum of 60 units may come from completion of 1000-level courses" on the
-- Bachelor of Computing, and the same wording appears across the programme
-- catalogue. Importing such a programme failed with a check violation and lost
-- the whole snapshot.
--
-- Each kind still needs its defining attribute (a level range, a subject, a
-- tag) and now needs at least one unit bound rather than a minimum specifically.

alter table public.requirement_conditions
  drop constraint requirement_conditions_typed_value_check;

alter table public.requirement_conditions
  add constraint requirement_conditions_typed_value_check check (
    case condition_kind
      when 'course' then code_id is not null
      when 'incompatible' then code_id is not null
      when 'structure' then code_id is not null or free_text is not null
      when 'structure_set' then structure_kind is not null
      when 'course_set_units' then
        minimum_units is not null
        or maximum_units is not null
        or minimum_count is not null
      when 'units_total' then
        minimum_units is not null or maximum_units is not null
      when 'subject_units' then
        subject_code is not null
        and (minimum_units is not null or maximum_units is not null)
      when 'level_units' then
        minimum_level is not null
        and (minimum_units is not null or maximum_units is not null)
      when 'tagged_units' then
        tag is not null
        and (minimum_units is not null or maximum_units is not null)
      when 'elective_units' then
        minimum_units is not null or maximum_units is not null
      when 'year_standing' then minimum_year is not null
      when 'gpa' then minimum_gpa is not null
      when 'wam' then minimum_wam is not null
      when 'permission' then free_text is not null
      when 'other' then free_text is not null
      else null
    end
  );
