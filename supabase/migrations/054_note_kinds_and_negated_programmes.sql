-- Labels for uncheckable notes and "not enrolled in" programme conditions.
--
-- Every `other` note is advisory and never blocks a plan. note_kind only says
-- how it is shown: 'required' for a mandatory condition Coursemap cannot check
-- (a police check, professional registration, immunisation), 'recommended' for
-- advice such as prose assumed knowledge, and 'check_with_anu' for ANU wording
-- the importer could not model and published verbatim for later review. An
-- ordinary note has no kind.
--
-- matches_structure false turns a programme or structure condition into "not
-- enrolled in", such as a route for students in other programs. Null or true
-- keeps the existing meaning.
alter table public.requirement_conditions
  add column note_kind text,
  add column matches_structure boolean,
  add constraint requirement_conditions_note_kind_check check (
    note_kind is null
    or (condition_kind = 'other' and note_kind in ('required', 'recommended', 'check_with_anu'))
  ),
  add constraint requirement_conditions_matches_structure_check check (
    matches_structure is null or condition_kind = 'structure'
  );

-- Fallback notes are found by kind when an administrator reviews them.
create index requirement_conditions_note_kind_idx
  on public.requirement_conditions (note_kind)
  where note_kind is not null;

-- Published requirements carry both values, unchanged otherwise from 053.
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
        'confidence', conditions.confidence,
        'noteKind', conditions.note_kind,
        'matchesStructure', conditions.matches_structure
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
