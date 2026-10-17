-- Eligibility wording that a hard rule cannot hold: units in a field the source
-- names without subject codes, a language-style sequence that a later
-- completed course closes, and grade averages over a subset of courses.
-- Soft (advisory) conditions already use the existing hardness column; these
-- kinds can be hard or soft like any other. A sequence keeps the course it is
-- relative to (the course being described) as text in free_text, because a
-- catalogue reference to a record's own identity would block its removal.
alter table public.requirement_conditions
  drop constraint requirement_conditions_kind_check,
  drop constraint requirement_conditions_typed_value_check,
  add constraint requirement_conditions_kind_check check ((condition_kind = any (array['course'::text, 'incompatible'::text, 'incompatible_concurrent'::text, 'structure'::text, 'structure_set'::text, 'course_set_units'::text, 'consecutive_semester_pair'::text, 'units_total'::text, 'subject_units'::text, 'subject_courses'::text, 'course_count'::text, 'filtered_units'::text, 'level_units'::text, 'tagged_units'::text, 'elective_units'::text, 'year_standing'::text, 'commencement_year'::text, 'enrolment_mode'::text, 'college_enrolment'::text, 'career'::text, 'gpa'::text, 'wam'::text, 'field_units'::text, 'subject_sequence'::text, 'permission'::text, 'other'::text]))),
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
    when 'course_count'::text then (minimum_count is not null and (subject_codes is not null or course_levels is not null) and minimum_units is null and maximum_units is null and requirement_mode is not null)
    when 'filtered_units'::text then (minimum_units is not null and minimum_units > 0 and (subject_codes is not null or course_levels is not null) and requirement_mode is not null)
    when 'subject_units'::text then ((subject_code is not null) and ((minimum_units is not null) or (maximum_units is not null)))
    when 'level_units'::text then ((minimum_level is not null) and ((minimum_units is not null) or (maximum_units is not null)))
    when 'tagged_units'::text then ((tag is not null) and ((minimum_units is not null) or (maximum_units is not null)))
    when 'elective_units'::text then ((minimum_units is not null) or (maximum_units is not null))
    when 'enrolment_mode'::text then (enrolment_mode is not null and matches_enrolment_mode is not null)
    when 'commencement_year'::text then (minimum_commencement_year is not null or maximum_commencement_year is not null)
    when 'year_standing'::text then (minimum_year is not null)
    when 'gpa'::text then (minimum_gpa is not null)
    when 'wam'::text then (minimum_wam is not null)
    when 'field_units'::text then (minimum_units is not null and minimum_units > 0 and free_text is not null and btrim(free_text) <> '')
    when 'subject_sequence'::text then (subject_code is not null and code_id is null and free_text ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$')
    when 'college_enrolment'::text then (free_text is not null and btrim(free_text) <> '')
    when 'career'::text then (career is not null and matches_career is not null)
    when 'permission'::text then (free_text is not null)
    when 'other'::text then (free_text is not null)
    else null::boolean
end);

-- A grade average may be scoped to subjects. Levels still belong only to
-- course counts and filtered unit totals.
alter table public.requirement_conditions
  drop constraint requirement_conditions_filters_kind_check,
  add constraint requirement_conditions_filters_kind_check check (
    condition_kind in ('course_count', 'filtered_units')
    or (course_levels is null and (subject_codes is null or condition_kind in ('gpa', 'wam')))
  );

-- A grade average may also be scoped to listed courses, held as options.
create or replace function private.validate_requirement_condition_option() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if not exists (
    select 1
    from public.requirement_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.condition_kind in ('course_set_units', 'consecutive_semester_pair', 'structure_set', 'gpa', 'wam')
  ) then
    raise exception 'requirement options belong to course_set_units, consecutive_semester_pair, structure_set, gpa or wam conditions'
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

-- A grade average's scoped courses are not prerequisites.
create or replace function private.requirement_projection(p_version_id bigint) returns jsonb
    language sql stable
    set search_path to ''
    as $$
  select jsonb_build_object(
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', rules.rule_kind,
        'ruleKind', rules.rule_kind,
        'hardness', rules.hardness,
        'sourceText', rules.source_text,
        'reviewState', rules.review_state,
        'confidence', rules.confidence
      ) order by rules.position, case rules.rule_kind
        when 'prerequisite' then 1 when 'corequisite' then 2
        when 'incompatibility' then 3 when 'permission' then 4
        when 'assumed_knowledge' then 5 else 6 end)
      from public.requirement_rules as rules
      where rules.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleGroups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', groups.group_key,
        'ruleKey', rules.rule_kind,
        'parentGroupKey', parents.group_key,
        'operator', groups.operator,
        'minimumCount', groups.minimum_count,
        'minimumUnits', groups.minimum_units,
        'maximumUnits', groups.maximum_units,
        'scope', groups.scope,
        'label', groups.label,
        'description', groups.description,
        'sourceText', groups.source_text,
        'position', groups.position
      ) order by rules.rule_kind, groups.position, groups.id)
      from public.requirement_groups as groups
      join public.requirement_rules as rules on rules.id = groups.rule_id
      left join public.requirement_groups as parents on parents.id = groups.parent_group_id
      where groups.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleConditions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', conditions.condition_key,
        'ruleKey', rules.rule_kind,
        'groupKey', groups.group_key,
        'position', conditions.position,
        'conditionKind', conditions.condition_kind,
        'requiredCourseCode', case
          when conditions.condition_kind in ('course', 'incompatible', 'incompatible_concurrent') then items.code
        end,
        'requiredStructureCode', case
          when conditions.condition_kind = 'structure' then items.code
        end,
        'structureKind', conditions.structure_kind,
        'minimumUnits', conditions.minimum_units,
        'maximumUnits', conditions.maximum_units,
        'minimumCount', conditions.minimum_count,
        'minimumMark', conditions.minimum_mark,
        'subjectCode', conditions.subject_code,
        'minimumCourseLevel', conditions.minimum_level,
        'maximumCourseLevel', conditions.maximum_level,
        'minimumGpa', conditions.minimum_gpa,
        'minimumYear', conditions.minimum_year,
        'enrolmentMode', conditions.enrolment_mode,
        'matchesEnrolmentMode', conditions.matches_enrolment_mode,
        'subjectCodes', to_jsonb(conditions.subject_codes),
        'courseLevels', to_jsonb(conditions.course_levels),
        'career', conditions.career,
        'matchesCareer', conditions.matches_career,
        'minimumCommencementYear', conditions.minimum_commencement_year,
        'maximumCommencementYear', conditions.maximum_commencement_year,
        'minimumWam', conditions.minimum_wam,
        'tag', conditions.tag,
        'freeText', conditions.free_text,
        'scope', conditions.scope,
        'includesAnyCourse', conditions.includes_any_course,
        'courseRequirementMode', conditions.requirement_mode,
        'hardness', conditions.hardness,
        'sourceText', conditions.source_text,
        'reviewState', conditions.review_state,
        'confidence', conditions.confidence
      ) order by rules.rule_kind, conditions.position, conditions.id)
      from public.requirement_conditions as conditions
      join public.requirement_rules as rules on rules.id = conditions.rule_id
      join public.requirement_groups as groups on groups.id = conditions.group_id
      left join public.catalogue_codes as items on items.id = conditions.code_id
      where conditions.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleConditionCourses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'conditionKey', conditions.condition_key,
        'position', options.position,
        'kind', options.kind,
        'sourceCourseCode', options.code,
        'title', options.title,
        'sourceText', options.source_text
      ) || case
        when options.maximum_units is null then '{}'::jsonb
        else jsonb_build_object('maximumUnits', options.maximum_units)
      end order by conditions.id, options.position)
      from public.requirement_condition_options as options
      join public.requirement_conditions as conditions on conditions.id = options.condition_id
      where options.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleCourseReferences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ruleKey', rules.rule_kind,
        'referencedCourseCode', items.code,
        'sourceText', item_references.source_text,
        'reviewState', item_references.review_state,
        'confidence', item_references.confidence
      ) order by rules.rule_kind, items.code)
      from public.requirement_item_references as item_references
      join public.requirement_rules as rules on rules.id = item_references.rule_id
      join public.catalogue_codes as items on items.id = item_references.code_id
      where item_references.version_id = p_version_id
    ), '[]'::jsonb),
    'prerequisiteCodes', coalesce((
      select jsonb_agg(codes.code order by codes.code)
      from (
        select items.code
        from public.requirement_item_references as item_references
        join public.requirement_rules as rules on rules.id = item_references.rule_id
        join public.catalogue_codes as items on items.id = item_references.code_id
        where rules.version_id = p_version_id and rules.rule_kind = 'prerequisite'
        union
        select items.code
        from public.requirement_conditions as conditions
        join public.requirement_rules as rules on rules.id = conditions.rule_id
        join public.catalogue_codes as items on items.id = conditions.code_id
        where rules.version_id = p_version_id
          and rules.rule_kind = 'prerequisite'
          and conditions.condition_kind = 'course'
        union
        select options.code
        from public.requirement_condition_options as options
        join public.requirement_conditions as conditions on conditions.id = options.condition_id
        join public.requirement_rules as rules on rules.id = conditions.rule_id
        where rules.version_id = p_version_id
          and rules.rule_kind = 'prerequisite'
          and options.kind = 'course'
          and conditions.condition_kind not in ('gpa', 'wam')
      ) as codes
    ), '[]'::jsonb)
  );
$$;
