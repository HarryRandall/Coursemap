begin;
\ir ../helpers/catalogue-review.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(22);

select extensions.is(
  (
    select count(*)
    from public.academic_years
    where year between 2020 and 2030
      and is_import_enabled
  ),
  11::bigint,
  'the clean course importer exposes exactly the agreed eleven-year window'
);

select extensions.ok(
  not exists (
    select 1 from public.academic_years where year not between 2020 and 2030
  )
  and not exists (
    select 1 from public.course_import_runs
  )
  and not exists (
    select 1 from public.plans
  )
  and to_regclass('public.academic_structure_versions') is null
  and not exists (
    select 1
    from public.course_snapshots
    where origin = 'legacy_backfill'
  ),
  'the cutover leaves no legacy years, imports, plans, programmes or snapshots'
);

select extensions.ok(
  to_regclass('public.course_versions') is null
  and to_regclass('public.catalogue_directory_courses') is null
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and (
        (
          table_name in (
            'course_offerings',
            'course_learning_outcomes',
            'course_assessment_items',
            'course_rules'
          )
          and column_name = 'course_version_id'
        )
        or (
          table_name = 'course_offerings'
          and column_name in ('catalogue_year_id', 'source_document_id', 'status')
        )
      )
  ),
  'legacy tables and rich-child lineage columns are absent'
);

select extensions.ok(
  (
    select count(*) = 3
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'course_snapshots'
      and column_name in ('source_page_id', 'level', 'subject_code')
      and is_nullable = 'NO'
  )
  and (
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'course_snapshot_field_evidence'
      and column_name = 'source_page_id'
  )
  and (
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'course_rule_conditions'
      and column_name = 'hardness'
  )
  and (
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'course_related_courses'
      and column_name = 'related_course_id'
  )
  and (
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'course_rule_condition_courses'
      and column_name = 'referenced_course_id'
  ),
  'snapshot provenance, identities and canonical rich fields are structurally required'
);

select extensions.ok(
  (
    select count(*) = 2
    from private.app_permissions
    where key in ('courses.read_drafts', 'courses.write')
      and category = 'courses'
  )
  and not exists (
    select 1
    from private.role_permissions as catalogue_grants
    join private.app_permissions as catalogue_permissions
      on catalogue_permissions.id = catalogue_grants.permission_id
    join (
      values
        ('catalogue.read_drafts'::text, 'courses.read_drafts'::text),
        ('catalogue.write'::text, 'courses.write'::text)
    ) as permission_map(catalogue_key, course_key)
      on permission_map.catalogue_key = catalogue_permissions.key
    where not exists (
      select 1
      from private.role_permissions as course_grants
      join private.app_permissions as course_permissions
        on course_permissions.id = course_grants.permission_id
      where course_grants.role_id = catalogue_grants.role_id
        and course_permissions.key = permission_map.course_key
    )
  ),
  'course permissions exist and inherit every corresponding catalogue role grant'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'courses',
        'course_years',
        'course_snapshots',
        'course_fees',
        'course_areas_of_interest',
        'course_related_courses',
        'course_attributes',
        'course_unit_options',
        'course_offerings',
        'offering_sessions',
        'course_learning_outcomes',
        'course_assessment_items',
        'course_assessment_outcomes',
        'course_rules',
        'course_rule_groups',
        'course_rule_conditions',
        'course_rule_condition_courses',
        'course_rule_course_references',
        'course_snapshot_field_evidence'
      ]::text[])
      and (
        coalesce(qual, '') ilike '%catalogue.%'
        or coalesce(with_check, '') ilike '%catalogue.%'
      )
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    where namespaces.nspname in ('public', 'private')
      and routines.proname ilike '%course%'
      and pg_catalog.pg_get_functiondef(routines.oid) ilike '%catalogue.%'
  ),
  'final course policies and RPCs do not depend on generic catalogue permissions'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.plan_items'::regclass
      and conname = 'plan_items_course_academic_year_fkey'
      and contype = 'f'
  )
  and exists (
    select 1
    from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'course_attempts'
      and trigger_name = 'course_attempts_enforce_snapshot_lineage'
  ),
  'planner and attempt lineage is enforced below the RPC layer'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '93000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'cutover-student@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now()
);

insert into public.catalogue_years (year, status, published_at)
values (2025, 'published', now())
on conflict (year) do update
set status = excluded.status,
    published_at = excluded.published_at;

insert into public.academic_periods (
  calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status
) values
  (2025, 'CUT-S1', 'Cutover Semester 1', 'S1', '2025-02-24', '2025-05-31', 1, 'published'),
  (2026, 'CUT-S1', 'Cutover Semester 1', 'S1', '2026-02-23', '2026-05-30', 1, 'published');

insert into public.course_sources (name, kind, base_url)
values (
  'Clean cutover test source',
  'clean_cutover_test',
  'https://clean-cutover.example.test'
);

insert into public.course_source_pages (
  source_id,
  academic_year_id,
  page_kind,
  external_key,
  canonical_url,
  media_type,
  content_sha256,
  http_status,
  byte_size
)
select
  sources.id,
  years.id,
  'course_page',
  'TWOY1000-' || years.year::text,
  'https://clean-cutover.example.test/' || years.year::text || '/TWOY1000',
  'text/html',
  case years.year
    when 2025 then repeat('5', 64)
    else repeat('6', 64)
  end,
  200,
  500
from public.course_sources as sources
join public.academic_years as years on years.year in (2025, 2026)
where sources.kind = 'clean_cutover_test';

insert into public.courses (code)
values ('TWOY1000'), ('MISS1000');

insert into public.course_years (course_id, academic_year_id)
select courses.id, years.id
from public.courses
cross join public.academic_years as years
where courses.code = 'TWOY1000'
  and years.year in (2025, 2026);

insert into public.course_snapshots (
  course_year_id,
  academic_year_id,
  snapshot_number,
  origin,
  source_page_id,
  projection_sha256,
  validation_status,
  overall_confidence,
  title,
  units,
  level,
  subject_code,
  academic_career,
  description,
  offering_status,
  created_by
)
select
  course_years.id,
  years.id,
  1,
  'import',
  documents.id,
  case years.year
    when 2025 then repeat('a', 64)
    else repeat('b', 64)
  end,
  'valid',
  0.99,
  'Two-year course ' || years.year::text,
  6,
  1000,
  'TWOY',
  'UGRD',
  'The exact ' || years.year::text || ' course snapshot.',
  'offered',
  '93000000-0000-4000-8000-000000000001'::uuid
from public.course_years
join public.courses on courses.id = course_years.course_id
join public.academic_years as years
  on years.id = course_years.academic_year_id
join public.course_source_pages as documents
  on documents.academic_year_id = years.id
 and documents.external_key = 'TWOY1000-' || years.year::text
where courses.code = 'TWOY1000';

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
  'You must have completed MISS1000.',
  'verified',
  0.99
from public.course_snapshots as snapshots
join public.academic_years as years
  on years.id = snapshots.academic_year_id
where years.year = 2025;

insert into public.course_rule_groups (
  course_rule_id,
  course_snapshot_id,
  projection_key,
  parent_group_id,
  operator,
  position
)
select
  rules.id,
  rules.course_snapshot_id,
  'prerequisite:group:root',
  null,
  'all_of',
  0
from public.course_rules as rules
where rules.source_text = 'You must have completed MISS1000.';

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
  'prerequisite:condition:0',
  groups.id,
  'course',
  prerequisites.id,
  'completed',
  'hard',
  'You must have completed MISS1000.',
  0.99,
  'verified',
  0
from public.course_rules as rules
join public.course_rule_groups as groups on groups.course_rule_id = rules.id
join public.courses as prerequisites on prerequisites.code = 'MISS1000'
where rules.source_text = 'You must have completed MISS1000.';

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
  'MISS1000',
  0.99,
  'verified'
from public.course_rules as rules
join public.courses as prerequisites on prerequisites.code = 'MISS1000'
where rules.source_text = 'You must have completed MISS1000.';

select pg_temp.approve_catalogue_fixture('course', snapshots.id)
from public.course_snapshots as snapshots
cross join public.course_years as course_years
where snapshots.course_year_id = course_years.id;

update public.course_years
set published_snapshot_id = snapshots.id
from public.course_snapshots as snapshots
where snapshots.course_year_id = course_years.id;

select extensions.is(
  public.published_course_detail('TWOY1000', 2025::smallint)
    ->'snapshot'->>'title',
  'Two-year course 2025',
  'the 2025 reader resolves only the 2025 published snapshot'
);

select extensions.is(
  public.published_course_detail('TWOY1000', 2026::smallint)
    ->'snapshot'->>'title',
  'Two-year course 2026',
  'the 2026 reader resolves only the 2026 published snapshot'
);

select extensions.is(
  public.published_course_detail('TWOY1000', 2027::smallint),
  null::jsonb,
  'an unavailable year never falls back to another snapshot'
);

select extensions.ok(
  exists (
    select 1
    from public.published_course_requisite_graph(
      'TWOY1000',
      2025::smallint
    )
    where from_code = 'MISS1000'
      and to_code = 'TWOY1000'
      and not from_is_available
      and to_is_available
  ),
  'the explicit-year graph retains unavailable prerequisite identities'
);

set local role anon;

select extensions.ok(
  exists (
    select 1 from public.courses where code = 'MISS1000'
  ),
  'public RLS exposes a placeholder referenced by a published prerequisite'
);

reset role;

select extensions.ok(
  (
    select is_available
    from public.published_course_availability('TWOY1000', 2025::smallint)
  )
  and (
    select is_available
    from public.published_course_availability('TWOY1000', 2026::smallint)
  )
  and not (
    select is_available
    from public.published_course_availability('TWOY1000', 2027::smallint)
  )
  and not (
    select is_available
    from public.published_course_availability('MISS1000', 2025::smallint)
  ),
  'planner availability is exact to the requested course and year'
);

insert into public.plans (
  owner_id,
  academic_year_id,
  name,
  is_primary,
  commencement_year,
  study_load
)
values (
  '93000000-0000-4000-8000-000000000001',
  (select id from public.academic_years where year = 2025),
  'Clean cutover plan',
  true,
  2025,
  'full_time'
);

select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$
    select public.add_current_user_plan_item(
      'TWOY1000',
      2025::smallint,
      2025::smallint,
      'CUT-S1'
    )
  $$,
  'the planner adds an explicitly selected published course year'
);

select extensions.ok(
  exists (
    select 1
    from public.plan_items
    join public.academic_years
      on academic_years.id = plan_items.academic_year_id
    join public.courses on courses.id = plan_items.course_id
    where courses.code = 'TWOY1000'
      and academic_years.year = 2025
      and plan_items.planned_calendar_year = 2025
      and plan_items.planned_period_code = 'CUT-S1'
  ),
  'the plan item persists the exact selected academic year'
);

select extensions.throws_ok(
  $$
    select public.add_current_user_plan_item(
      'MISS1000',
      2025::smallint,
      null::smallint,
      null
    )
  $$,
  'P0002',
  'The selected course has no published snapshot for the planned year.',
  'the planner rejects a placeholder with no published course year'
);

reset role;

select extensions.throws_ok(
  $$
    insert into public.plan_items (
      plan_id,
      owner_id,
      course_id,
      academic_year_id
    ) values (
      (select id from public.plans where name = 'Clean cutover plan'),
      '93000000-0000-4000-8000-000000000001',
      (select id from public.courses where code = 'MISS1000'),
      (select id from public.academic_years where year = 2025)
    )
  $$,
  'P0002',
  'The selected course year was not found.',
  'the active-course-year trigger rejects a direct plan write for a missing course year'
);

set local role authenticated;

select extensions.lives_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.courses on courses.id = plan_items.course_id
        where courses.code = 'TWOY1000'
      ),
      'completed',
      82
    )
  $$,
  'recording an attempt resolves the plan item exact published snapshot'
);

select extensions.ok(
  exists (
    select 1
    from public.course_attempts as attempts
    join public.course_snapshots as snapshots
      on snapshots.id = attempts.course_snapshot_id
    join public.course_years on course_years.id = snapshots.course_year_id
    join public.academic_years
      on academic_years.id = course_years.academic_year_id
    where attempts.owner_id = '93000000-0000-4000-8000-000000000001'
      and academic_years.year = 2025
      and snapshots.title = 'Two-year course 2025'
      and attempts.units_attempted = 6
      and attempts.units_earned = 6
  ),
  'the attempt permanently records the exact 2025 snapshot and units'
);

reset role;

insert into public.course_snapshots (
  course_year_id,
  academic_year_id,
  snapshot_number,
  origin,
  based_on_snapshot_id,
  source_page_id,
  projection_sha256,
  validation_status,
  overall_confidence,
  title,
  units,
  level,
  subject_code,
  academic_career,
  description,
  offering_status,
  created_by
)
select
  snapshots.course_year_id,
  snapshots.academic_year_id,
  2,
  'manual_edit',
  snapshots.id,
  snapshots.source_page_id,
  repeat('c', 64),
  'valid',
  1,
  'Revised two-year course 2025',
  snapshots.units,
  snapshots.level,
  snapshots.subject_code,
  snapshots.academic_career,
  'A later published 2025 snapshot.',
  snapshots.offering_status,
  '93000000-0000-4000-8000-000000000001'::uuid
from public.course_snapshots as snapshots
join public.academic_years as years
  on years.id = snapshots.academic_year_id
where years.year = 2025
  and snapshots.snapshot_number = 1;

select pg_temp.approve_catalogue_fixture('course', snapshots.id)
from public.course_snapshots as snapshots
cross join public.course_years as course_years
where snapshots.course_year_id = course_years.id
  and snapshots.snapshot_number = 2;

update public.course_years
set published_snapshot_id = snapshots.id
from public.course_snapshots as snapshots
where snapshots.course_year_id = course_years.id
  and snapshots.snapshot_number = 2;

set local role authenticated;

select extensions.ok(
  exists (
    select 1
    from public.course_attempts as attempts
    join public.course_snapshots as snapshots
      on snapshots.id = attempts.course_snapshot_id
    join public.course_years on course_years.id = snapshots.course_year_id
    where attempts.owner_id = (select auth.uid())
      and snapshots.title = 'Two-year course 2025'
      and course_years.published_snapshot_id <> snapshots.id
  ),
  'an owner can still read the exact attempt snapshot after republication'
);

reset role;

select extensions.throws_ok(
  $$
    insert into public.course_attempts (
      owner_id,
      course_id,
      course_snapshot_id,
      academic_period_id,
      status,
      units_attempted,
      units_earned
    ) values (
      '93000000-0000-4000-8000-000000000001',
      (select id from public.courses where code = 'MISS1000'),
      (
        select snapshots.id
        from public.course_snapshots as snapshots
        join public.academic_years as years
          on years.id = snapshots.academic_year_id
        where years.year = 2025
          and snapshots.snapshot_number = 1
      ),
      (
        select id from public.academic_periods
        where calendar_year = 2025 and code = 'CUT-S1'
      ),
      'enrolled',
      6,
      0
    )
  $$,
  '23503',
  'course attempt snapshot does not belong to the selected course',
  'a direct attempt write cannot pair a snapshot with another course'
);

select extensions.throws_ok(
  $$
    insert into public.course_attempts (
      owner_id,
      course_id,
      course_snapshot_id,
      academic_period_id,
      status,
      units_attempted,
      units_earned
    ) values (
      '93000000-0000-4000-8000-000000000001',
      (select id from public.courses where code = 'TWOY1000'),
      (
        select snapshots.id
        from public.course_snapshots as snapshots
        join public.academic_years as years
          on years.id = snapshots.academic_year_id
        where years.year = 2025
          and snapshots.snapshot_number = 1
      ),
      (
        select id from public.academic_periods
        where calendar_year = 2026 and code = 'CUT-S1'
      ),
      'enrolled',
      6,
      0
    )
  $$,
  '23514',
  'course attempt period year does not match the snapshot academic year',
  'a direct attempt write cannot attach a snapshot to another year'
);

select * from extensions.finish();

rollback;
