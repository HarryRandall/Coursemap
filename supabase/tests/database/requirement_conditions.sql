begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

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
select snapshots.id as snapshot_id, snapshots.academic_year_id
from public.catalogue_snapshots as snapshots
join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
where details.title = 'Requirement fixture';

insert into public.requirement_rules (snapshot_id, academic_year_id, rule_kind, source_text)
select snapshot_id, academic_year_id, 'prerequisite', 'Complete REQT1001 and 24 units.' from fixture;

select extensions.throws_ok(
  $$
    insert into public.requirement_rules (snapshot_id, academic_year_id, rule_kind, source_text)
    select snapshot_id, academic_year_id, 'prerequisite', 'Duplicate' from fixture
  $$,
  '23505',
  null,
  'a snapshot holds one rule per kind'
);

insert into public.requirement_groups (rule_id, snapshot_id, group_key, operator)
select rules.id, rules.snapshot_id, 'root', 'all_of'
from public.requirement_rules as rules join fixture on fixture.snapshot_id = rules.snapshot_id;

select extensions.throws_ok(
  $$
    insert into public.requirement_groups (rule_id, snapshot_id, group_key, operator)
    select rules.id, rules.snapshot_id, 'second-root', 'any_of'
    from public.requirement_rules as rules join fixture on fixture.snapshot_id = rules.snapshot_id;
    set constraints all immediate
  $$,
  '23514',
  null,
  'a rule tree has exactly one root'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_groups (rule_id, snapshot_id, group_key, operator)
    select rules.id, rules.snapshot_id, 'no-count', 'at_least'
    from public.requirement_rules as rules join fixture on fixture.snapshot_id = rules.snapshot_id
  $$,
  '23514',
  null,
  'at_least groups carry a minimum count'
);

select extensions.lives_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, snapshot_id, group_id, condition_key, position, condition_kind,
      item_id, item_kind, requirement_mode
    )
    select groups.rule_id, groups.snapshot_id, groups.id, 'course', 0, 'course',
      (select id from public.catalogue_items where code = 'REQT1001'), 'course', 'completed'
    from public.requirement_groups as groups join fixture on fixture.snapshot_id = groups.snapshot_id
  $$,
  'course conditions reference a catalogue item'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, snapshot_id, group_id, condition_key, position, condition_kind
    )
    select groups.rule_id, groups.snapshot_id, groups.id, 'gpa', 1, 'gpa'
    from public.requirement_groups as groups join fixture on fixture.snapshot_id = groups.snapshot_id
  $$,
  '23514',
  null,
  'each condition kind requires its typed value'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, snapshot_id, group_id, condition_key, position, condition_kind, minimum_units
    )
    select groups.rule_id, groups.snapshot_id, groups.id, 'legacy', 1, 'unit_total', 24
    from public.requirement_groups as groups join fixture on fixture.snapshot_id = groups.snapshot_id
  $$,
  '23514',
  null,
  'retired condition kinds are rejected'
);

insert into public.requirement_conditions (
  rule_id, snapshot_id, group_id, condition_key, position, condition_kind, structure_kind, minimum_count
)
select groups.rule_id, groups.snapshot_id, groups.id, 'majors', 1, 'structure_set', 'major', 1
from public.requirement_groups as groups join fixture on fixture.snapshot_id = groups.snapshot_id;

select extensions.lives_ok(
  $$
    insert into public.requirement_condition_options (condition_id, snapshot_id, position, kind, code, item_id)
    select conditions.id, conditions.snapshot_id, 1, 'major', 'REQT-MAJ',
      (select id from public.catalogue_items where code = 'REQT-MAJ')
    from public.requirement_conditions as conditions where conditions.condition_key = 'majors'
  $$,
  'set conditions accept resolved options'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, snapshot_id, position, kind, code, item_id)
    select conditions.id, conditions.snapshot_id, 2, 'major', 'REQT-OTHER',
      (select id from public.catalogue_items where code = 'REQT-MAJ')
    from public.requirement_conditions as conditions where conditions.condition_key = 'majors'
  $$,
  '23503',
  null,
  'a resolved option must match the item it names'
);

select extensions.throws_ok(
  $$
    insert into public.requirement_condition_options (condition_id, snapshot_id, position, kind, code)
    select conditions.id, conditions.snapshot_id, 1, 'course', 'REQT1001'
    from public.requirement_conditions as conditions where conditions.condition_key = 'course'
  $$,
  '23503',
  null,
  'options belong to set conditions only'
);

select pg_temp.publish_snapshot((select snapshot_id from fixture));

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, snapshot_id, group_id, condition_key, position, condition_kind, minimum_units
    )
    select groups.rule_id, groups.snapshot_id, groups.id, 'late', 5, 'units_total', 24
    from public.requirement_groups as groups join fixture on fixture.snapshot_id = groups.snapshot_id
  $$,
  '55000',
  null,
  'requirements are frozen once the snapshot is sealed'
);

set local role anon;

select extensions.ok(
  (
    select public.published_course_detail('REQT1000', 2029::smallint) -> 'prerequisiteCodes'
  ) = '["REQT1001"]'::jsonb
  and exists (
    select 1 from public.catalogue_items where code in ('REQT1001', 'REQT-MAJ')
  ),
  'published requirements expose prerequisite codes and keep referenced placeholders visible'
);

reset role;

select * from extensions.finish();

rollback;
