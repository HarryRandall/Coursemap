begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(27);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.record_current_user_course_attempt(uuid,text,numeric,numeric)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.record_current_user_course_attempt(uuid,text,numeric,numeric)',
    'execute'
  )
  and to_regprocedure(
    'public.record_current_user_course_attempt(uuid,text,numeric)'
  ) is null,
  'the attempt writer exposes only the optional four-argument contract'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.current_user_course_attempt_snapshot_projections(bigint[])',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.current_user_course_attempt_snapshot_projections(bigint[])',
    'execute'
  )
  and (
    select count(*) = 16
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'course_snapshot_details', 'course_offerings', 'offering_sessions',
        'course_learning_outcomes', 'course_assessment_items',
        'course_assessment_outcomes', 'course_fees', 'course_attributes',
        'course_unit_options', 'course_areas_of_interest',
        'course_related_courses', 'course_rules', 'course_rule_groups',
        'course_rule_conditions', 'course_rule_condition_courses',
        'course_rule_course_references'
      )
      and policyname like '%\_read'
      and qual like '%can_read_snapshot(%.snapshot_id)%'
  ),
  'attempt owners alone receive the exact historical projection contract and rich-row policies'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '95000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'attempt-units@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.plans (
  owner_id, academic_year_id, name, is_primary, commencement_year, study_load
) values (
  '95000000-0000-4000-8000-000000000001',
  (select id from public.academic_years where year = 2026),
  'Attempt unit contract plan',
  true,
  2026,
  'full_time'
);

-- Two courses: a range-unit course and a variable-unit course with two
-- versions. Version 1 is published first; version 2 is published midway.
create temporary table fixture_snapshots on commit drop as
select
  'RANG1000'::text as code,
  1 as version,
  pg_temp.create_course_snapshot('RANG1000', 2026::smallint, 'Range course', 'range', null, 6, 12) as snapshot_id
union all
select
  'VARI1000',
  1,
  pg_temp.create_course_snapshot('VARI1000', 2026::smallint, 'Variable course v1', 'variable', null)
union all
select
  'VARI1000',
  2,
  pg_temp.create_course_snapshot('VARI1000', 2026::smallint, 'Variable course v2', 'variable', null);

grant select on table fixture_snapshots to authenticated;

insert into public.course_unit_options (
  snapshot_id, position, units, label, source_text
)
select
  fixture.snapshot_id,
  options.position,
  options.units,
  options.units::text || ' units',
  options.units::text || ' units'
from fixture_snapshots as fixture
cross join lateral (
  select options.position, options.units
  from (values (1, 6::numeric), (2, 12::numeric)) as options(position, units)
  where fixture.version = 1
  union all
  select options.position, options.units
  from (values (1, 6::numeric), (2, 9::numeric)) as options(position, units)
  where fixture.version = 2
) as options
where fixture.code = 'VARI1000';

insert into public.course_rules (
  snapshot_id,
  academic_year_id,
  rule_kind,
  hardness,
  source_text,
  review_state,
  confidence
)
select
  fixture.snapshot_id,
  snapshots.academic_year_id,
  'prerequisite',
  'hard',
  case fixture.version when 1 then 'Complete RANG1000.' else 'Complete COMP1100.' end,
  case fixture.version when 1 then 'verified' else 'review' end,
  case fixture.version when 1 then 0.91 else 0.41 end
from fixture_snapshots as fixture
join public.catalogue_snapshots as snapshots on snapshots.id = fixture.snapshot_id
where fixture.code = 'VARI1000';

insert into public.course_rule_groups (
  course_rule_id,
  snapshot_id,
  projection_key,
  parent_group_id,
  operator,
  minimum_count,
  position
)
select rules.id, rules.snapshot_id, 'prerequisite:group:root', null, 'all_of', null, 0
from public.course_rules as rules
join fixture_snapshots as fixture on fixture.snapshot_id = rules.snapshot_id
where fixture.code = 'VARI1000';

insert into public.course_rule_conditions (
  course_rule_id,
  snapshot_id,
  projection_key,
  group_id,
  condition_kind,
  required_course_id,
  course_requirement_mode,
  hardness,
  source_text,
  confidence,
  review_state,
  position
)
select
  rules.id,
  rules.snapshot_id,
  'prerequisite:condition:direct',
  groups.id,
  'course',
  prerequisites.id,
  'completed',
  'hard',
  rules.source_text,
  case fixture.version when 1 then 0.87 else 0.37 end,
  case fixture.version when 1 then 'verified' else 'review' end,
  0
from public.course_rules as rules
join fixture_snapshots as fixture on fixture.snapshot_id = rules.snapshot_id
join public.course_rule_groups as groups on groups.course_rule_id = rules.id
join public.catalogue_items as prerequisites
  on prerequisites.kind = 'course'
 and prerequisites.code = case when fixture.version = 1 then 'RANG1000' else 'COMP1100' end
where fixture.code = 'VARI1000';

insert into public.course_rule_course_references (
  course_rule_id,
  snapshot_id,
  referenced_course_id,
  source_text,
  confidence,
  review_state
)
select
  rules.id,
  rules.snapshot_id,
  prerequisites.id,
  rules.source_text,
  case fixture.version when 1 then 0.83 else 0.33 end,
  case fixture.version when 1 then 'verified' else 'automatic' end
from public.course_rules as rules
join fixture_snapshots as fixture on fixture.snapshot_id = rules.snapshot_id
join public.catalogue_items as prerequisites
  on prerequisites.kind = 'course'
 and prerequisites.code = case when fixture.version = 1 then 'RANG1000' else 'COMP1100' end
where fixture.code = 'VARI1000';

select pg_temp.publish_snapshot(fixture.snapshot_id)
from fixture_snapshots as fixture
where fixture.version = 1;

select set_config(
  'request.jwt.claim.sub',
  '95000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$
    select public.add_current_user_plan_item(
      'COMP1100', 2026::smallint, 2026::smallint, 'S1'
    )
  $$,
  'a fixed-unit course can be planned'
);

select extensions.throws_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'COMP1100'
      ),
      'completed',
      80,
      12
    )
  $$,
  '22023',
  'Attempted units must match the fixed course value.',
  'a fixed-unit attempt rejects a different supplied value'
);

select extensions.ok(
  exists (
    select 1
    from public.plan_items
    join public.catalogue_items as courses on courses.id = plan_items.course_id
    where plan_items.owner_id = (select auth.uid())
      and courses.code = 'COMP1100'
  ),
  'a rejected fixed-unit attempt leaves its plan item intact'
);

select extensions.lives_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'COMP1100'
      ),
      'completed',
      80
    )
  $$,
  'a fixed-unit attempt defaults to the published fixed value'
);

select extensions.ok(
  exists (
    select 1
    from public.course_attempts
    join public.catalogue_items as courses on courses.id = course_attempts.course_id
    where course_attempts.owner_id = (select auth.uid())
      and courses.code = 'COMP1100'
      and course_attempts.units_attempted = 6
      and course_attempts.units_earned = 6
  ),
  'the fixed default is stored exactly'
);

select extensions.lives_ok(
  $$
    select public.add_current_user_plan_item(
      'RANG1000', 2026::smallint, 2026::smallint, 'S1'
    )
  $$,
  'a range-unit course can be planned'
);

select extensions.throws_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'RANG1000'
      ),
      'completed',
      75
    )
  $$,
  '22023',
  'Choose the attempted units for this course.',
  'a range-unit attempt requires an explicit value'
);

select extensions.throws_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'RANG1000'
      ),
      'completed',
      75,
      15
    )
  $$,
  '22023',
  'Attempted units must be within the published course range.',
  'a range-unit attempt rejects a value outside its bounds'
);

select extensions.throws_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'RANG1000'
      ),
      'completed',
      75,
      6.001
    )
  $$,
  '22023',
  'Attempted units must be a positive value with at most two decimal places.',
  'an attempted unit value cannot exceed stored precision'
);

select extensions.lives_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'RANG1000'
      ),
      'completed',
      75,
      9
    )
  $$,
  'a range-unit attempt accepts an explicit value inside its bounds'
);

select extensions.ok(
  exists (
    select 1
    from public.course_attempts
    join public.catalogue_items as courses on courses.id = course_attempts.course_id
    where course_attempts.owner_id = (select auth.uid())
      and courses.code = 'RANG1000'
      and course_attempts.units_attempted = 9
      and course_attempts.units_earned = 9
  ),
  'the selected range units are stored exactly'
);

select extensions.lives_ok(
  $$
    select public.add_current_user_plan_item(
      'VARI1000', 2026::smallint, 2026::smallint, 'S1'
    )
  $$,
  'a variable-unit course can be planned'
);

select extensions.throws_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'VARI1000'
      ),
      'completed',
      88
    )
  $$,
  '22023',
  'Choose the attempted units for this course.',
  'a variable-unit attempt requires an explicit option'
);

select extensions.throws_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'VARI1000'
      ),
      'completed',
      88,
      9
    )
  $$,
  '22023',
  'Attempted units must match a published course unit option.',
  'a variable-unit attempt rejects a value between its saved options'
);

select extensions.lives_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'VARI1000'
      ),
      'completed',
      88,
      12
    )
  $$,
  'a variable-unit attempt accepts an exact saved option'
);

select extensions.ok(
  exists (
    select 1
    from public.course_attempts
    join public.catalogue_items as courses on courses.id = course_attempts.course_id
    join public.course_snapshot_details as course_snapshots
      on course_snapshots.snapshot_id = course_attempts.course_snapshot_id
    where course_attempts.owner_id = (select auth.uid())
      and courses.code = 'VARI1000'
      and course_snapshots.title = 'Variable course v1'
      and course_attempts.units_attempted = 12
      and course_attempts.units_earned = 12
  ),
  'the selected variable option and exact snapshot are stored'
);

reset role;

select pg_temp.publish_snapshot(fixture.snapshot_id)
from fixture_snapshots as fixture
where fixture.code = 'VARI1000' and fixture.version = 2;

create temporary table historical_attempt_snapshots
on commit drop
as
select course_attempts.course_snapshot_id as snapshot_id
from public.course_attempts
join public.catalogue_items as courses on courses.id = course_attempts.course_id
where course_attempts.owner_id = '95000000-0000-4000-8000-000000000001'
  and courses.code = 'VARI1000';

grant select on table historical_attempt_snapshots to authenticated;

set local role authenticated;

select extensions.ok(
  exists (
    select 1
    from public.catalogue_item_years as course_years
    join public.catalogue_items as courses on courses.id = course_years.item_id
    join public.course_snapshot_details as course_snapshots
      on course_snapshots.snapshot_id = course_years.published_snapshot_id
    where courses.code = 'VARI1000'
      and course_snapshots.title = 'Variable course v2'
  ),
  'a later variable-unit snapshot can replace the published snapshot'
);

select extensions.is(
  (
    select count(*)
    from public.course_unit_options
    where course_unit_options.snapshot_id = (
      select snapshot_id from historical_attempt_snapshots
    )
  ),
  2::bigint,
  'an attempt owner can still read rich rows from the exact historical snapshot'
);

select extensions.ok(
  exists (
    select 1
    from public.current_user_course_attempt_snapshot_projections(array[
      (select snapshot_id from historical_attempt_snapshots)
    ]) as projections
    where projections.projection #>> '{snapshot,title}' = 'Variable course v1'
      and jsonb_array_length(projections.projection -> 'unitOptions') = 2
      and (projections.projection #>> '{unitOptions,0,units}')::numeric = 6
      and (projections.projection #>> '{unitOptions,1,units}')::numeric = 12
      and projections.projection #>> '{rules,0,reviewState}' = 'verified'
      and (projections.projection #>> '{rules,0,confidence}')::numeric = 0.91
      and projections.projection #>>
        '{ruleConditions,0,reviewState}' = 'verified'
      and (projections.projection #>>
        '{ruleConditions,0,confidence}')::numeric = 0.87
      and projections.projection #>>
        '{ruleCourseReferences,0,reviewState}' = 'verified'
      and (projections.projection #>>
        '{ruleCourseReferences,0,confidence}')::numeric = 0.83
      and projections.projection #>>
        '{prerequisiteCodes,0}' = 'RANG1000'
      and not projections.projection @> jsonb_build_object(
        'prerequisiteCodes', jsonb_build_array('COMP1100')
      )
  ),
  'the owner projection preserves exact historical fields, rule metadata and prerequisite codes rather than current data'
);

select extensions.lives_ok(
  $$
    select public.add_current_user_plan_item(
      'VARI1000', 2026::smallint, 2026::smallint, 'S1'
    )
  $$,
  'the variable course can be planned again after republication'
);

select extensions.throws_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'VARI1000'
      ),
      'failed',
      45,
      6
    )
  $$,
  '22023',
  'Attempted units cannot change after an attempt is recorded.',
  're-saving an existing attempt rejects a different unit choice'
);

select extensions.ok(
  exists (
    select 1
    from public.plan_items
    join public.catalogue_items as courses on courses.id = plan_items.course_id
    where plan_items.owner_id = (select auth.uid())
      and courses.code = 'VARI1000'
  )
  and exists (
    select 1
    from public.course_attempts
    join public.catalogue_items as courses on courses.id = course_attempts.course_id
    join public.course_snapshot_details as course_snapshots
      on course_snapshots.snapshot_id = course_attempts.course_snapshot_id
    where course_attempts.owner_id = (select auth.uid())
      and courses.code = 'VARI1000'
      and course_snapshots.title = 'Variable course v1'
      and course_attempts.units_attempted = 12
      and course_attempts.status = 'completed'
  ),
  'a rejected re-save leaves both the plan item and exact attempt unchanged'
);

select extensions.lives_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_items as courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'VARI1000'
      ),
      'failed',
      45
    )
  $$,
  'an omitted unit value safely re-saves the existing attempt'
);

select extensions.ok(
  exists (
    select 1
    from public.course_attempts
    join public.catalogue_items as courses on courses.id = course_attempts.course_id
    join public.course_snapshot_details as course_snapshots
      on course_snapshots.snapshot_id = course_attempts.course_snapshot_id
    where course_attempts.owner_id = (select auth.uid())
      and courses.code = 'VARI1000'
      and course_snapshots.title = 'Variable course v1'
      and course_attempts.units_attempted = 12
      and course_attempts.units_earned = 0
      and course_attempts.status = 'failed'
      and course_attempts.mark = 45
      and course_attempts.grade is null
  )
  and not exists (
    select 1
    from public.plan_items
    join public.catalogue_items as courses on courses.id = plan_items.course_id
    where plan_items.owner_id = (select auth.uid())
      and courses.code = 'VARI1000'
  ),
  're-save preserves exact snapshot and units while updating result fields'
);

select set_config(
  'request.jwt.claim.sub',
  '95000000-0000-4000-8000-000000000099',
  true
);

select extensions.ok(
  not exists (
    select 1
    from public.course_unit_options
    where course_unit_options.snapshot_id = (
      select snapshot_id from historical_attempt_snapshots
    )
  )
  and not exists (
    select 1
    from public.current_user_course_attempt_snapshot_projections(array[
      (select snapshot_id from historical_attempt_snapshots)
    ])
  ),
  'another authenticated user cannot read the owner''s historical rich rows or projection'
);

select * from extensions.finish();

rollback;
