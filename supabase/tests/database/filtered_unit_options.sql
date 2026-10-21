begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;
select extensions.plan(9);

select pg_temp.create_course_snapshot('FILT2000', 2029::smallint, 'Filtered unit fixture');
select pg_temp.create_course_snapshot('FILT2001', 2029::smallint, 'Other filtered fixture');
select pg_temp.catalogue_item_year('course', 'FILT1001', 2029::smallint);
select pg_temp.catalogue_item_year('major', 'FILT-MAJ', 2029::smallint);

create temporary table fixture on commit drop as
select versions.id as version_id, versions.academic_year_id
from public.catalogue_versions as versions
join public.course_version_details as details on details.version_id = versions.id
where details.title = 'Filtered unit fixture';

insert into public.requirement_rules (version_id, academic_year_id, rule_kind, source_text)
select version_id, academic_year_id, 'prerequisite', '12 SOCY units, which may include FILT1001.' from fixture;

insert into public.requirement_groups (rule_id, version_id, group_key, operator)
select rules.id, rules.version_id, 'root', 'all_of'
from public.requirement_rules as rules join fixture on fixture.version_id = rules.version_id;

insert into public.requirement_conditions (
  rule_id, version_id, group_id, condition_key, position, condition_kind,
  minimum_units, subject_codes, course_levels, requirement_mode
)
select groups.rule_id, groups.version_id, groups.id, 'filtered', 0, 'filtered_units',
  12, array['SOCY'], array[1000]::smallint[], 'completed'
from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id;

select extensions.lives_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code, code_id)
    select conditions.id, conditions.version_id, 1, 'course', 'FILT1001',
      (select id from public.catalogue_codes where kind = 'course' and code = 'FILT1001')
    from public.requirement_conditions as conditions where condition_key = 'filtered'
  $$,
  'a filtered unit pool accepts a resolved named course alternative'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code)
    select conditions.id, conditions.version_id, 2, 'course', 'FILT1002'
    from public.requirement_conditions as conditions where condition_key = 'filtered'
  $$,
  'a filtered unit pool retains a literal course alternative without inventing an identity'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code)
    select conditions.id, conditions.version_id, 3, 'major', 'FILT-MAJ'
    from public.requirement_conditions as conditions where condition_key = 'filtered'
  $$, '23514', null, 'filtered unit options cannot be structures'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code, maximum_units)
    select conditions.id, conditions.version_id, 3, 'course', 'FILT1003', 12
    from public.requirement_conditions as conditions where condition_key = 'filtered'
  $$, '23514', null, 'filtered unit options cannot add a repeat allowance'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code, code_id)
    select conditions.id, conditions.version_id, 3, 'course', 'FILT1003',
      (select id from public.catalogue_codes where kind = 'course' and code = 'FILT1001')
    from public.requirement_conditions as conditions where condition_key = 'filtered'
  $$, '23503', null, 'resolved filtered alternatives must match the named course identity'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code)
    select conditions.id,
      (select versions.id from public.catalogue_versions as versions
        join public.course_version_details as details on details.version_id = versions.id
        where details.title = 'Other filtered fixture'), 3, 'course', 'FILT1003'
    from public.requirement_conditions as conditions where condition_key = 'filtered';
    set constraints all immediate;
  $$, '23503', null, 'a filtered option cannot belong to another snapshot'
);

insert into public.requirement_conditions (
  rule_id, version_id, group_id, condition_key, position, condition_kind, minimum_count, subject_codes, requirement_mode
)
select groups.rule_id, groups.version_id, groups.id, 'count', 1, 'course_count', 2, array['SOCY'], 'completed'
from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id;

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code)
    select conditions.id, conditions.version_id, 1, 'course', 'FILT1001'
    from public.requirement_conditions as conditions where condition_key = 'count'
  $$, '23503', null, 'course counts still cannot carry named unit alternatives'
);

select pg_temp.publish_snapshot((select version_id from fixture));
set local role anon;
select extensions.is(
  (select count(*) from jsonb_array_elements(
    public.published_course_detail('FILT2000', 2029::smallint) -> 'ruleConditionCourses'
  ) as options(value) where value ->> 'sourceCourseCode' in ('FILT1001', 'FILT1002')),
  2::bigint,
  'anonymous published detail retains both named course options'
);
reset role;

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, version_id, position, kind, code)
    select conditions.id, conditions.version_id, 3, 'course', 'FILT1003'
    from public.requirement_conditions as conditions where condition_key = 'filtered'
  $$, '55000', null, 'published filtered options remain immutable'
);

select * from extensions.finish();
rollback;
