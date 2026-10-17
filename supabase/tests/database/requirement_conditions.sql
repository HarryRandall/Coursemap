begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(43);

select extensions.ok(
  to_regclass('public.course_rules') is null
  and to_regclass('public.course_rule_conditions') is null
  and to_regclass('public.academic_structure_requirement_groups') is null
  and to_regclass('public.academic_structure_requirement_conditions') is null
  and to_regclass('public.academic_structure_unmodelled_requirements') is null
  and to_regclass('public.academic_structure_summary_fields') is null,
  'both retired requirement vocabularies are absent'
);

select pg_temp.create_course_snapshot('REQT1000', 2029::smallint, 'Requirement fixture');
select pg_temp.catalogue_item_year('course', 'REQT1001', 2029::smallint);
select pg_temp.catalogue_item_year('major', 'REQT-MAJ', 2029::smallint);

create temporary table fixture on commit drop as
select snapshots.id as version_id, snapshots.academic_year_id
from public.catalogue_versions as snapshots
join public.course_version_details as details on details.version_id = snapshots.id
where details.title = 'Requirement fixture';

insert into public.requirement_rules (version_id, academic_year_id, rule_kind, source_text)
select version_id, academic_year_id, 'prerequisite', 'Complete REQT1001 and 24 units.' from fixture;

select extensions.throws_ok(
  $$
    insert into public.requirement_rules (version_id, academic_year_id, rule_kind, source_text)
    select version_id, academic_year_id, 'prerequisite', 'Duplicate' from fixture
  $$,
  '23505',
  null,
  'a snapshot holds one rule per kind'
);

insert into public.requirement_groups (rule_id, version_id, group_key, operator)
select rules.id, rules.version_id, 'root', 'all_of'
from public.requirement_rules as rules join fixture on fixture.version_id = rules.version_id;

select extensions.throws_ok(
  $$
    insert into public.requirement_groups (rule_id, version_id, group_key, operator)
    select rules.id, rules.version_id, 'second-root', 'any_of'
    from public.requirement_rules as rules join fixture on fixture.version_id = rules.version_id;
    set constraints all immediate
  $$,
  '23514',
  null,
  'a rule tree has exactly one root'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_groups (rule_id, version_id, group_key, operator)
    select rules.id, rules.version_id, 'no-count', 'at_least'
    from public.requirement_rules as rules join fixture on fixture.version_id = rules.version_id
  $$,
  '23514',
  null,
  'at_least groups carry a minimum count'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind,
      code_id, item_kind, requirement_mode
    )
    select groups.rule_id, groups.version_id, groups.id, 'course', 0, 'course',
      (select id from public.catalogue_codes where code = 'REQT1001'), 'course', 'completed'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  'course conditions reference a catalogue item'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind
    )
    select groups.rule_id, groups.version_id, groups.id, 'gpa', 1, 'gpa'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'each condition kind requires its typed value'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units
    )
    select groups.rule_id, groups.version_id, groups.id, 'legacy', 1, 'unit_total', 24
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'retired condition kinds are rejected'
);

insert into public.requirement_conditions (
  rule_id, version_id, group_id, condition_key, position, condition_kind, structure_kind, minimum_count
)
select groups.rule_id, groups.version_id, groups.id, 'majors', 1, 'structure_set', 'major', 1
from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id;

select extensions.lives_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code, code_id)
    select conditions.id, conditions.version_id, 1, 'major', 'REQT-MAJ',
      (select id from public.catalogue_codes where code = 'REQT-MAJ')
    from public.requirement_conditions as conditions where conditions.condition_key = 'majors'
  $$,
  'set conditions accept resolved options'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code, code_id)
    select conditions.id, conditions.version_id, 2, 'major', 'REQT-OTHER',
      (select id from public.catalogue_codes where code = 'REQT-MAJ')
    from public.requirement_conditions as conditions where conditions.condition_key = 'majors'
  $$,
  '23503',
  null,
  'a resolved option must match the item it names'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code)
    select conditions.id, conditions.version_id, 1, 'course', 'REQT1001'
    from public.requirement_conditions as conditions where conditions.condition_key = 'course'
  $$,
  '23503',
  null,
  'options belong to set conditions only'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind,
      minimum_units, maximum_units, free_text
    )
    select groups.rule_id, groups.version_id, groups.id, 'semester-pair', 2,
      'consecutive_semester_pair', 12, 12, 'Complete in consecutive semesters.'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  'a consecutive semester pair accepts an exact unit amount and timing wording'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind,
      minimum_units, maximum_units, free_text
    )
    select groups.rule_id, groups.version_id, groups.id, 'wrong-pair', 3,
      'consecutive_semester_pair', 12, 18, 'Complete in consecutive semesters.'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'a consecutive semester pair rejects conflicting unit bounds'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code)
    select conditions.id, conditions.version_id, choices.position, 'course', choices.code
    from public.requirement_conditions as conditions
    cross join (values (1, 'REQT1002'), (2, 'REQT1003')) as choices(position, code)
    where conditions.condition_key = 'semester-pair'
  $$,
  'a consecutive semester pair stores two ordered course options'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code)
    select conditions.id, conditions.version_id, 3, 'course', 'REQT1004'
    from public.requirement_conditions as conditions where conditions.condition_key = 'semester-pair'
  $$,
  '23514',
  null,
  'a consecutive semester pair rejects a third option'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind,
      minimum_units, maximum_units, minimum_level, maximum_level, free_text
    )
    select groups.rule_id, groups.version_id, groups.id, 'exchange-route', 3,
      'other', 24, 24, 3000, 3999,
      '24 units of 3000-level approved exchange with pre-approval.'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  'an unmeasured exchange condition preserves its units and level'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_count, subject_codes, course_levels, requirement_mode
    )
    select groups.rule_id, groups.version_id, groups.id, 'law-count', 10, 'course_count', 5, array['LAWS'], array[1000, 6100]::smallint[], 'completed_or_concurrent'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  'a course count accepts subject and level filters with concurrency'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_count, requirement_mode
    )
    select groups.rule_id, groups.version_id, groups.id, 'bare-count', 11, 'course_count', 5, 'completed'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'a course count needs a subject or level filter'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_count, subject_codes
    )
    select groups.rule_id, groups.version_id, groups.id, 'modeless-count', 12, 'course_count', 5, array['LAWS']
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'a course count states whether current enrolment counts'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units, subject_codes, requirement_mode
    )
    select groups.rule_id, groups.version_id, groups.id, 'pooled-units', 13, 'filtered_units', 12, array['CLAS', 'GREK', 'LATN', 'HIST'], 'completed'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  'filtered units accept several subjects'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units, subject_codes, requirement_mode
    )
    select groups.rule_id, groups.version_id, groups.id, 'zero-units', 14, 'filtered_units', 0, array['CLAS'], 'completed'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'filtered units require a positive amount'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units, subject_codes, requirement_mode
    )
    select groups.rule_id, groups.version_id, groups.id, 'lower-subject', 15, 'filtered_units', 12, array['Clas'], 'completed'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'every subject filter is a four-letter code'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units, subject_codes, course_levels, requirement_mode
    )
    select groups.rule_id, groups.version_id, groups.id, 'empty-subjects', 16, 'filtered_units', 12, array[]::text[], array[1000]::smallint[], 'completed'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'an empty subject filter is null instead'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_count, course_levels, requirement_mode
    )
    select groups.rule_id, groups.version_id, groups.id, 'high-level', 17, 'course_count', 2, array[10000]::smallint[], 'completed'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'level filters stay within 0 to 9999'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units, subject_codes
    )
    select groups.rule_id, groups.version_id, groups.id, 'stray-subjects', 18, 'units_total', 24, array['LAWS']
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'only course counts and filtered units carry filter lists'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units, requirement_mode
    )
    select groups.rule_id, groups.version_id, groups.id, 'stray-mode', 19, 'units_total', 24, 'completed'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'a unit total without filters carries no requirement mode'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, career, matches_career
    )
    select groups.rule_id, groups.version_id, groups.id, 'postgraduate', 20, 'career', 'postgraduate', true
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  'a career condition names a career and whether it applies'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, career, matches_career
    )
    select groups.rule_id, groups.version_id, groups.id, 'bad-career', 21, 'career', 'graduate', true
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'career conditions use the four recognised careers'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_gpa, career, matches_career
    )
    select groups.rule_id, groups.version_id, groups.id, 'stray-career', 22, 'gpa', 5, 'research', false
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'career values belong to career conditions only'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, code_id, item_kind
    )
    select groups.rule_id, groups.version_id, groups.id, 'major', 23, 'structure', (select id from public.catalogue_codes where code = 'REQT-MAJ'), 'major'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  'a structure condition can reference a major'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind,
      minimum_units, maximum_units
    )
    select groups.rule_id, groups.version_id, groups.id, 'repeat-list', 24,
      'course_set_units', 24, 24
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id;
    insert into public.requirement_condition_options (
      condition_id, version_id, position, kind, code, maximum_units
    )
    select conditions.id, conditions.version_id, 1, 'course', 'REQT1002', 24
    from public.requirement_conditions as conditions
    where conditions.condition_key = 'repeat-list'
  $$,
  'a course list option records the units its repeated attempts may contribute'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (
      condition_id, version_id, position, kind, code, maximum_units
    )
    select conditions.id, conditions.version_id, 2, 'course', 'REQT1003', 36
    from public.requirement_conditions as conditions
    where conditions.condition_key = 'repeat-list'
  $$,
  '23514',
  null,
  'a repeat allowance fits within its course list maximum'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (
      condition_id, version_id, position, kind, code, maximum_units
    )
    select conditions.id, conditions.version_id, 1, 'course', 'REQT1004', 12
    from public.requirement_conditions as conditions
    where conditions.condition_key = 'semester-pair'
  $$,
  '23514',
  null,
  'only a course list can let a course repeat'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (
      condition_id, version_id, position, kind, code, maximum_units
    )
    select conditions.id, conditions.version_id, 3, 'major', 'REQT-REP', 12
    from public.requirement_conditions as conditions
    where conditions.condition_key = 'majors'
  $$,
  '23514',
  null,
  'only a listed course can repeat'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind,
      minimum_units, subject_code, minimum_gpa, subject_codes, free_text, hardness
    )
    select groups.rule_id, groups.version_id, groups.id, item.key, item.position,
      item.kind, item.units, item.subject, item.gpa, item.subjects, item.text, 'advisory'
    from public.requirement_groups as groups
    join fixture on fixture.version_id = groups.version_id
    cross join (values
      ('field', 30, 'field_units', 12::numeric, null::text, null::numeric, null::text[], 'the relevant field'),
      ('sequence', 31, 'subject_sequence', null, 'REQT', null, null, 'REQT1000'),
      ('science-average', 32, 'gpa', null, null, 5, array['REQT'], 'Science courses')
    ) as item(key, position, kind, units, subject, gpa, subjects, text);
    insert into public.requirement_condition_options (
      condition_id, version_id, position, kind, code
    )
    select conditions.id, conditions.version_id, 1, 'course', 'REQT1009'
    from public.requirement_conditions as conditions
    where conditions.condition_key = 'science-average'
  $$,
  'soft field units, a sequence and a scoped average with a course are stored'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units
    )
    select groups.rule_id, groups.version_id, groups.id, 'unnamed-field', 33, 'field_units', 12
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'field units name their field'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, subject_code, free_text
    )
    select groups.rule_id, groups.version_id, groups.id, 'loose-sequence', 34, 'subject_sequence', 'REQT', 'a language course'
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'a sequence is anchored to a course code'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units, subject_codes
    )
    select groups.rule_id, groups.version_id, groups.id, 'filtered-total', 35, 'units_total', 24, array['REQT']
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'only counts, filtered units and averages carry subject filters'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (
      condition_id, version_id, position, kind, code
    )
    select conditions.id, conditions.version_id, 2, 'major', 'REQT-MAJ'
    from public.requirement_conditions as conditions
    where conditions.condition_key = 'science-average'
  $$,
  '23514',
  null,
  'an average is scoped to courses only'
);

select pg_temp.publish_snapshot((select version_id from fixture));

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_units
    )
    select groups.rule_id, groups.version_id, groups.id, 'late', 5, 'units_total', 24
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '55000',
  null,
  'requirements are frozen once the snapshot is sealed'
);

set local role anon;

select extensions.ok(
  (
    select public.published_course_detail('REQT1000', 2029::smallint) -> 'prerequisiteCodes'
  ) = '["REQT1001", "REQT1002", "REQT1003"]'::jsonb
  and exists (
    select 1 from public.catalogue_codes where code in ('REQT1001', 'REQT-MAJ')
  ),
  'published requirements expose prerequisite codes and keep referenced placeholders visible'
);

select extensions.ok(
  (
    select count(*) = 2
    from jsonb_array_elements(
      public.published_course_detail('REQT1000', 2029::smallint) -> 'ruleConditions'
    ) as conditions(value)
    where (value ->> 'key' = 'law-count'
        and value -> 'subjectCodes' = '["LAWS"]'::jsonb
        and value -> 'courseLevels' = '[1000, 6100]'::jsonb
        and value ->> 'courseRequirementMode' = 'completed_or_concurrent')
      or (value ->> 'key' = 'postgraduate'
        and value ->> 'career' = 'postgraduate'
        and value -> 'matchesCareer' = 'true'::jsonb)
  ),
  'published requirements expose filters and careers'
);

select extensions.ok(
  (
    select count(*) filter (where value ? 'maximumUnits') = 1
      and bool_or(
        value ->> 'conditionKey' = 'repeat-list'
        and (value ->> 'maximumUnits')::numeric = 24
      )
    from jsonb_array_elements(
      public.published_course_detail('REQT1000', 2029::smallint) -> 'ruleConditionCourses'
    ) as options(value)
  ),
  'published requirements expose a repeat allowance only where one is recorded'
);

select extensions.ok(
  (
    select count(*) = 3
    from jsonb_array_elements(
      public.published_course_detail('REQT1000', 2029::smallint) -> 'ruleConditions'
    ) as conditions(value)
    where value ->> 'hardness' = 'advisory'
      and (
        (value ->> 'key' = 'field' and value ->> 'freeText' = 'the relevant field')
        or (value ->> 'key' = 'sequence' and value ->> 'subjectCode' = 'REQT'
          and value ->> 'freeText' = 'REQT1000')
        or (value ->> 'key' = 'science-average' and value -> 'subjectCodes' = '["REQT"]'::jsonb)
      )
  ),
  'published requirements expose soft conditions with their values'
);

reset role;

select * from extensions.finish();

rollback;
