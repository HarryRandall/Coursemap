-- Requisite wording that counts courses or units across several subjects and
-- levels, and enrolment in an academic career. Each array is non-empty when
-- present, so an absent filter is always null rather than an empty list.
alter table public.requirement_conditions
  add column subject_codes text[],
  add column course_levels smallint[],
  add column career text,
  add column matches_career boolean,
  add constraint requirement_conditions_subject_codes_check check (
    subject_codes is null or (
      array_ndims(subject_codes) = 1
      and cardinality(subject_codes) > 0
      and array_position(subject_codes, null) is null
      and array_to_string(subject_codes, ',') ~ '^[A-Z]{4}(,[A-Z]{4})*$'
    )
  ),
  add constraint requirement_conditions_course_levels_check check (
    course_levels is null or (
      array_ndims(course_levels) = 1
      and cardinality(course_levels) > 0
      and array_position(course_levels, null) is null
      and 0 <= all(course_levels)
      and 9999 >= all(course_levels)
    )
  ),
  add constraint requirement_conditions_filters_kind_check check (
    condition_kind in ('course_count', 'filtered_units')
    or (subject_codes is null and course_levels is null)
  ),
  add constraint requirement_conditions_career_check check (
    (condition_kind = 'career' and career is not null
      and career in ('undergraduate', 'postgraduate', 'research', 'non_award')
      and matches_career is not null)
    or (condition_kind <> 'career' and career is null and matches_career is null)
  );

-- A course count or unit total can accept current enrolment, as a course can.
alter table public.requirement_conditions
  drop constraint requirement_conditions_requirement_mode_check,
  add constraint requirement_conditions_requirement_mode_check check (
    (requirement_mode is null or requirement_mode in ('completed', 'completed_or_concurrent'))
    and (condition_kind <> 'course' or requirement_mode is not null)
    and (condition_kind in ('course', 'course_count', 'filtered_units') or requirement_mode is null)
  );

alter table public.requirement_conditions
  drop constraint requirement_conditions_kind_check,
  drop constraint requirement_conditions_typed_value_check,
  add constraint requirement_conditions_kind_check check ((condition_kind = any (array['course'::text, 'incompatible'::text, 'incompatible_concurrent'::text, 'structure'::text, 'structure_set'::text, 'course_set_units'::text, 'consecutive_semester_pair'::text, 'units_total'::text, 'subject_units'::text, 'subject_courses'::text, 'course_count'::text, 'filtered_units'::text, 'level_units'::text, 'tagged_units'::text, 'elective_units'::text, 'year_standing'::text, 'commencement_year'::text, 'enrolment_mode'::text, 'college_enrolment'::text, 'career'::text, 'gpa'::text, 'wam'::text, 'permission'::text, 'other'::text]))),
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
    when 'college_enrolment'::text then (free_text is not null and btrim(free_text) <> '')
    when 'career'::text then (career is not null and matches_career is not null)
    when 'permission'::text then (free_text is not null)
    when 'other'::text then (free_text is not null)
    else null::boolean
end);

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
      ) order by conditions.id, options.position)
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
      ) as codes
    ), '[]'::jsonb)
  );
$$;
