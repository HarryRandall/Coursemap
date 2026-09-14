begin;
\ir ../helpers/catalogue-review.inc

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
    select count(*) = 15
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and policyname like '%\_read\_own\_attempt\_snapshots' escape '\'
  )
  and exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'courses'
      and policyname = 'courses_read_own_attempt_history'
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

insert into public.course_source_pages (
  source_id, academic_year_id, page_kind, external_key, canonical_url,
  media_type, content_sha256, http_status, byte_size
)
select
  sources.id,
  years.id,
  'course_page',
  documents.external_key,
  documents.canonical_url,
  'text/html',
  documents.content_sha256,
  200,
  256
from public.course_sources as sources
join public.academic_years as years on years.year = 2026
cross join (values
  (
    'RANG1000'::text,
    'https://coursemap.local.test/2026/rang1000',
    repeat('3', 64)
  ),
  (
    'VARI1000'::text,
    'https://coursemap.local.test/2026/vari1000-v1',
    repeat('4', 64)
  ),
  (
    'VARI1000'::text,
    'https://coursemap.local.test/2026/vari1000-v2',
    repeat('5', 64)
  )
) as documents(external_key, canonical_url, content_sha256)
where sources.kind = 'local_mock';

insert into public.courses (code)
values ('RANG1000'), ('VARI1000');

insert into public.course_years (course_id, academic_year_id)
select courses.id, years.id
from public.courses
join public.academic_years as years on years.year = 2026
where courses.code in ('RANG1000', 'VARI1000');

insert into public.course_snapshots (
  course_year_id, academic_year_id, snapshot_number, origin,
  source_page_id, projection_sha256, validation_status,
  has_critical_uncertainty, title, unit_value_kind, units,
  minimum_units, maximum_units, level, subject_code, academic_career,
  offering_status, created_by
)
select
  course_years.id,
  years.id,
  snapshots.snapshot_number,
  'import',
  documents.id,
  snapshots.projection_sha256,
  'valid',
  false,
  snapshots.title,
  snapshots.unit_value_kind,
  null,
  6,
  case when snapshots.snapshot_number = 2 then 9 else 12 end,
  1000,
  left(courses.code, 4),
  'UGRD',
  'offered',
  '95000000-0000-4000-8000-000000000001'
from public.course_years
join public.courses on courses.id = course_years.course_id
join public.academic_years as years
  on years.id = course_years.academic_year_id
join (values
  ('RANG1000'::text, 1, 'Range course', 'range'::text, repeat('6', 64)),
  ('VARI1000'::text, 1, 'Variable course v1', 'variable'::text, repeat('7', 64)),
  ('VARI1000'::text, 2, 'Variable course v2', 'variable'::text, repeat('8', 64))
) as snapshots(code, snapshot_number, title, unit_value_kind, projection_sha256)
  on snapshots.code = courses.code
join public.course_source_pages as documents
  on documents.academic_year_id = years.id
 and documents.external_key = courses.code
 and documents.content_sha256 = case snapshots.snapshot_number
   when 1 then case courses.code
     when 'RANG1000' then repeat('3', 64)
     else repeat('4', 64)
   end
   else repeat('5', 64)
 end
where years.year = 2026;

insert into public.course_unit_options (
  course_snapshot_id, position, units, label, source_text
)
select
  snapshots.id,
  options.position,
  options.units,
  options.units::text || ' units',
  options.units::text || ' units'
from public.course_snapshots as snapshots
cross join lateral (
  select options.position, options.units
  from (values (1, 6::numeric), (2, 12::numeric))
    as options(position, units)
  where snapshots.snapshot_number = 1
  union all
  select options.position, options.units
  from (values (1, 6::numeric), (2, 9::numeric))
    as options(position, units)
  where snapshots.snapshot_number = 2
) as options
join public.course_years on course_years.id = snapshots.course_year_id
join public.courses on courses.id = course_years.course_id
where courses.code = 'VARI1000';

insert into public.course_rules (
  course_snapshot_id,
  academic_year_id,
  course_source_page_id,
  rule_kind,
  hardness,
  source_text,
  review_state,
  confidence
)
select
  snapshots.id,
  snapshots.academic_year_id,
  snapshots.source_page_id,
  'prerequisite',
  'hard',
  case snapshots.snapshot_number
    when 1 then 'Complete RANG1000.'
    else 'Complete COMP1100.'
  end,
  case snapshots.snapshot_number when 1 then 'verified' else 'review' end,
  case snapshots.snapshot_number when 1 then 0.91 else 0.41 end
from public.course_snapshots as snapshots
join public.course_years on course_years.id = snapshots.course_year_id
join public.courses on courses.id = course_years.course_id
where courses.code = 'VARI1000';

insert into public.course_rule_groups (
  course_rule_id,
  course_snapshot_id,
  projection_key,
  parent_group_id,
  operator,
  minimum_count,
  position
)
select
  rules.id,
  rules.course_snapshot_id,
  'prerequisite:group:root',
  null,
  'all_of',
  null,
  0
from public.course_rules as rules
join public.course_snapshots as snapshots
  on snapshots.id = rules.course_snapshot_id
join public.course_years on course_years.id = snapshots.course_year_id
join public.courses on courses.id = course_years.course_id
where courses.code = 'VARI1000';

insert into public.course_rule_conditions (
  course_rule_id,
  course_snapshot_id,
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
  rules.course_snapshot_id,
  'prerequisite:condition:direct',
  groups.id,
  'course',
  prerequisites.id,
  'completed',
  'hard',
  rules.source_text,
  case snapshots.snapshot_number when 1 then 0.87 else 0.37 end,
  case snapshots.snapshot_number when 1 then 'verified' else 'review' end,
  0
from public.course_rules as rules
join public.course_snapshots as snapshots
  on snapshots.id = rules.course_snapshot_id
join public.course_years on course_years.id = snapshots.course_year_id
join public.courses on courses.id = course_years.course_id
join public.course_rule_groups as groups on groups.course_rule_id = rules.id
join public.courses as prerequisites on prerequisites.code = case
  when snapshots.snapshot_number = 1 then 'RANG1000'
  else 'COMP1100'
end
where courses.code = 'VARI1000';

insert into public.course_rule_course_references (
  course_rule_id,
  course_snapshot_id,
  referenced_course_id,
  source_text,
  confidence,
  review_state
)
select
  rules.id,
  rules.course_snapshot_id,
  prerequisites.id,
  rules.source_text,
  case snapshots.snapshot_number when 1 then 0.83 else 0.33 end,
  case snapshots.snapshot_number when 1 then 'verified' else 'automatic' end
from public.course_rules as rules
join public.course_snapshots as snapshots
  on snapshots.id = rules.course_snapshot_id
join public.course_years on course_years.id = snapshots.course_year_id
join public.courses on courses.id = course_years.course_id
join public.courses as prerequisites on prerequisites.code = case
  when snapshots.snapshot_number = 1 then 'RANG1000'
  else 'COMP1100'
end
where courses.code = 'VARI1000';

select pg_temp.approve_catalogue_fixture('course', snapshots.id)
from public.course_snapshots as snapshots
cross join public.course_years as course_years
where snapshots.course_year_id = course_years.id
  and snapshots.snapshot_number = 1
  and exists (
    select 1
    from public.courses
    where courses.id = course_years.course_id
      and courses.code in ('RANG1000', 'VARI1000')
  );

update public.course_years
set published_snapshot_id = snapshots.id
from public.course_snapshots as snapshots
where snapshots.course_year_id = course_years.id
  and snapshots.snapshot_number = 1
  and exists (
    select 1
    from public.courses
    where courses.id = course_years.course_id
      and courses.code in ('RANG1000', 'VARI1000')
  );

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
        join public.courses on courses.id = plan_items.course_id
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
    join public.courses on courses.id = plan_items.course_id
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
        join public.courses on courses.id = plan_items.course_id
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
    join public.courses on courses.id = course_attempts.course_id
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
        join public.courses on courses.id = plan_items.course_id
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
        join public.courses on courses.id = plan_items.course_id
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
        join public.courses on courses.id = plan_items.course_id
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
        join public.courses on courses.id = plan_items.course_id
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
    join public.courses on courses.id = course_attempts.course_id
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
        join public.courses on courses.id = plan_items.course_id
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
        join public.courses on courses.id = plan_items.course_id
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
        join public.courses on courses.id = plan_items.course_id
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
    join public.courses on courses.id = course_attempts.course_id
    join public.course_snapshots
      on course_snapshots.id = course_attempts.course_snapshot_id
    where course_attempts.owner_id = (select auth.uid())
      and courses.code = 'VARI1000'
      and course_snapshots.title = 'Variable course v1'
      and course_attempts.units_attempted = 12
      and course_attempts.units_earned = 12
  ),
  'the selected variable option and exact snapshot are stored'
);

reset role;

select pg_temp.approve_catalogue_fixture('course', snapshots.id)
from public.course_snapshots as snapshots
join public.courses on true
cross join public.course_years as course_years
where snapshots.course_year_id = course_years.id
  and courses.id = course_years.course_id
  and courses.code = 'VARI1000'
  and snapshots.snapshot_number = 2;

update public.course_years
set published_snapshot_id = snapshots.id
from public.course_snapshots as snapshots
join public.courses on true
where snapshots.course_year_id = course_years.id
  and courses.id = course_years.course_id
  and courses.code = 'VARI1000'
  and snapshots.snapshot_number = 2;

create temporary table historical_attempt_snapshots
on commit drop
as
select course_attempts.course_snapshot_id as snapshot_id
from public.course_attempts
join public.courses on courses.id = course_attempts.course_id
where course_attempts.owner_id = '95000000-0000-4000-8000-000000000001'
  and courses.code = 'VARI1000';

grant select on table historical_attempt_snapshots to authenticated;

set local role authenticated;

select extensions.ok(
  exists (
    select 1
    from public.course_years
    join public.courses on courses.id = course_years.course_id
    join public.course_snapshots
      on course_snapshots.id = course_years.published_snapshot_id
    where courses.code = 'VARI1000'
      and course_snapshots.title = 'Variable course v2'
  ),
  'a later variable-unit snapshot can replace the published snapshot'
);

select extensions.is(
  (
    select count(*)
    from public.course_unit_options
    where course_unit_options.course_snapshot_id = (
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
        join public.courses on courses.id = plan_items.course_id
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
    join public.courses on courses.id = plan_items.course_id
    where plan_items.owner_id = (select auth.uid())
      and courses.code = 'VARI1000'
  )
  and exists (
    select 1
    from public.course_attempts
    join public.courses on courses.id = course_attempts.course_id
    join public.course_snapshots
      on course_snapshots.id = course_attempts.course_snapshot_id
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
        join public.courses on courses.id = plan_items.course_id
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
    join public.courses on courses.id = course_attempts.course_id
    join public.course_snapshots
      on course_snapshots.id = course_attempts.course_snapshot_id
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
    join public.courses on courses.id = plan_items.course_id
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
    where course_unit_options.course_snapshot_id = (
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
