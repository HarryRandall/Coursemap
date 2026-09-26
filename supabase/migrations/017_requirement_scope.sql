-- Tell a degree's parts from the rules across it.
--
-- ANU writes a degree's requirements in two layers: "192 units, of which a
-- maximum of 60 units may come from 1000-level courses" constrains every
-- course the degree counts, while "the 192 units must include 48 units of
-- compulsory courses" is a part that a course fills and then counts nowhere
-- else. Whatever the parts leave is electives. The requirement tree kept both
-- layers as plain nodes, so a planner could not allocate a course to one part
-- or know what was left over for electives.
--
-- A group or condition now carries its scope, and a course list records when
-- it ends "Any other ANU courses", which makes the list suggestions only.

alter table public.requirement_groups
    add column scope text default 'part'::text not null;

alter table public.requirement_groups
    add constraint requirement_groups_scope_check check ((scope = any (array['part'::text, 'degree'::text])));

alter table public.requirement_conditions
    add column scope text default 'part'::text not null,
    add column includes_any_course boolean default false not null;

alter table public.requirement_conditions
    add constraint requirement_conditions_scope_check check ((scope = any (array['part'::text, 'degree'::text])));

-- Only a course list can be open to any other course.
alter table public.requirement_conditions
    add constraint requirement_conditions_includes_any_course_check check (((not includes_any_course) or (condition_kind = 'course_set_units'::text)));

comment on column public.requirement_groups.scope is 'part fills a share of the degree and uses its courses up; degree constrains every course the degree counts without using any up.';
comment on column public.requirement_conditions.scope is 'part fills a share of the degree and uses its courses up; degree constrains every course the degree counts without using any up.';
comment on column public.requirement_conditions.includes_any_course is 'A course list ending "Any other ANU courses": its courses are suggestions and any course counts.';

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
          when conditions.condition_kind in ('course', 'incompatible') then items.code
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
