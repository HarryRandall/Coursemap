begin;
\ir ../helpers/catalogue-review.inc

insert into public.import_models(id,name,provider) values ('test/model', 'Test model', 'Test') on conflict do nothing;

create extension if not exists pgtap with schema extensions;

select extensions.plan(37);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.create_course_manual_snapshot(bigint,bigint,jsonb)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.publish_course_snapshot(bigint,bigint,bigint)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.confirm_course_manual_snapshot(bigint,bigint,jsonb,uuid[],text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.archive_course_year(bigint,bigint,bigint)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.create_course_manual_snapshot(bigint,bigint,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.confirm_course_manual_snapshot(bigint,bigint,jsonb,uuid[],text)',
    'execute'
  ),
  'snapshot write RPCs are exposed only to authenticated users'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.course_years', 'update')
  and not has_table_privilege('authenticated', 'public.course_snapshots', 'insert')
  and not has_table_privilege('authenticated', 'public.course_fees', 'insert')
  and not has_table_privilege('authenticated', 'public.course_rules', 'insert'),
  'authenticated callers cannot bypass the canonical write RPCs'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '93000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'snapshot-admin@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '93000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'snapshot-student@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '93000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'snapshot-writer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

update private.user_roles
set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '93000000-0000-4000-8000-000000000001';

insert into private.app_roles (key, name, description)
values (
  'snapshot_writer',
  'Snapshot writer',
  'Writes and reviews native course snapshots in this contract test.'
);

insert into private.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from private.app_roles as roles
join private.app_permissions as permissions
  on permissions.key = 'courses.write'
where roles.key = 'snapshot_writer';

update private.user_roles
set
  role_id = (select id from private.app_roles where key = 'snapshot_writer'),
  granted_by = '93000000-0000-4000-8000-000000000003'
where user_id = '93000000-0000-4000-8000-000000000003';

insert into public.course_sources (name, kind, base_url)
values (
  'Snapshot write test source',
  'snapshot_write_test',
  'https://snapshot-write.example.test'
);

insert into public.course_source_pages (
  source_id, academic_year_id, page_kind, external_key, canonical_url,
  media_type, content_sha256, http_status, byte_size
)
select
  sources.id,
  years.id,
  documents.page_kind,
  documents.external_key,
  'https://snapshot-write.example.test/' || documents.external_key,
  'text/html',
  documents.content_sha256,
  200,
  100
from public.course_sources as sources
join public.academic_years as years on years.year = 2028
cross join (values
  ('course_page'::text, 'EDIT1000'::text, repeat('a', 64)),
  ('course_directory'::text, '2028-directory'::text, repeat('b', 64)),
  ('course_page'::text, 'CRIT1000'::text, repeat('c', 64))
) as documents(page_kind, external_key, content_sha256)
where sources.kind = 'snapshot_write_test';

insert into public.courses (code)
values ('EDIT1000'), ('RELA1000'), ('REQS1000'), ('CRIT1000');

insert into public.course_directory_entries (
  academic_year_id, course_id, code, title, units, source_page_id
)
select
  years.id,
  courses.id,
  courses.code,
  'Editable course',
  6,
  documents.id
from public.academic_years as years
join public.courses on courses.code = 'EDIT1000'
join public.course_source_pages as documents
  on documents.academic_year_id = years.id
 and documents.page_kind = 'course_directory'
where years.year = 2028;

insert into public.course_years (course_id, academic_year_id)
select courses.id, years.id
from public.courses
cross join public.academic_years as years
where courses.code in ('EDIT1000', 'CRIT1000')
  and years.year = 2028
on conflict (course_id, academic_year_id) do nothing;

insert into public.course_snapshots (
  course_year_id, academic_year_id, snapshot_number, origin,
  source_page_id, projection_sha256, schema_version, validation_status,
  overall_confidence, has_critical_uncertainty, title, unit_value_kind,
  minimum_units, maximum_units, eftsl, level, subject_code, subject_name,
  school, college, academic_career, convener_text, delivery_summary,
  introduction, description, workload_text, workload_hours,
  inherent_requirements, prescribed_texts, offering_status, source_updated_at,
  created_by
)
select
  course_years.id,
  years.id,
  1,
  'import',
  documents.id,
  repeat('1', 64),
  'course-snapshot.v1',
  'valid',
  0.88,
  false,
  'Editable course',
  'variable',
  6,
  12,
  0.125,
  1000,
  'EDIT',
  'Editing',
  'Test school',
  'Test college',
  'UGRD',
  'Test convener',
  'In person',
  'Introduction',
  'Original description',
  'Ten hours each week',
  10,
  'None',
  'Test text',
  'offered',
  '2028-01-10T00:00:00Z'::timestamptz,
  '93000000-0000-4000-8000-000000000001'
from public.course_years
join public.courses on courses.id = course_years.course_id
join public.academic_years as years on years.id = course_years.academic_year_id
join public.course_source_pages as documents
  on documents.academic_year_id = years.id
 and documents.external_key = courses.code
where courses.code = 'EDIT1000';

create temporary table snapshot_write_fixture as
select
  course_years.id as course_year_id,
  snapshots.id as base_snapshot_id,
  snapshots.source_page_id,
  course_years.academic_year_id
from public.course_years
join public.courses on courses.id = course_years.course_id
join public.course_snapshots as snapshots
  on snapshots.course_year_id = course_years.id
where courses.code = 'EDIT1000';

grant select on snapshot_write_fixture to authenticated;

insert into public.course_unit_options (
  course_snapshot_id, position, units, label, source_text
)
select base_snapshot_id, position, units, units || ' units', units || ' units'
from snapshot_write_fixture
cross join (values (1, 6::numeric), (2, 12::numeric)) as options(position, units);

insert into public.course_fees (
  course_snapshot_id, position, fee_year, audience, fee_type, amount,
  currency, basis, source_label, source_text
)
select
  base_snapshot_id, 1, 2028, 'domestic', 'indicative', 900, 'AUD',
  'course', 'Domestic', '$900'
from snapshot_write_fixture;

insert into public.course_areas_of_interest (course_snapshot_id, position, name)
select base_snapshot_id, 1, 'Software engineering'
from snapshot_write_fixture;

insert into public.course_attributes (
  course_snapshot_id, position, attribute_kind, value, source_text
)
select base_snapshot_id, 1, 'stem', 'STEM', 'STEM course'
from snapshot_write_fixture;

insert into public.course_related_courses (
  course_snapshot_id, position, relation_kind, related_course_id,
  source_course_code, source_course_title, source_text
)
select
  fixture.base_snapshot_id, 1, 'equivalent', related.id, related.code,
  'Related course', 'Equivalent to RELA1000'
from snapshot_write_fixture as fixture
join public.courses as related on related.code = 'RELA1000';

insert into public.course_offerings (
  course_snapshot_id, academic_year_id, course_source_page_id,
  delivery_mode, location
)
select
  base_snapshot_id, academic_year_id, source_page_id,
  'In person', 'Acton'
from snapshot_write_fixture;

insert into public.offering_sessions (
  course_offering_id, course_snapshot_id, academic_year_id,
  course_source_page_id, academic_period_id, academic_period_code,
  academic_period_name, position, class_number, starts_on, enrol_closes_on,
  census_on, ends_on, delivery_mode, location, class_summary_url, source_text
)
select
  offerings.id, fixture.base_snapshot_id, fixture.academic_year_id,
  fixture.source_page_id, periods.id, 'S1', 'Semester 1', 1,
  '1234', '2028-02-21', '2028-03-04', '2028-03-31', '2028-05-26',
  'In person', 'Acton', 'https://classes.anu.edu.au/1234', 'Semester 1'
from snapshot_write_fixture as fixture
join public.course_offerings as offerings
  on offerings.course_snapshot_id = fixture.base_snapshot_id
left join public.academic_periods as periods
  on periods.calendar_year = 2028 and periods.code = 'S1';

insert into public.course_learning_outcomes (course_snapshot_id, position, body)
select base_snapshot_id, position, body
from snapshot_write_fixture
cross join (values
  (1, 'Explain snapshot editing'),
  (2, 'Apply snapshot editing')
) as outcomes(position, body);

insert into public.course_assessment_items (
  course_snapshot_id, position, title, weight, hurdle, due_text, source_text
)
select base_snapshot_id, 1, 'Project', 50, false, 'Week 8', 'Project (50%)'
from snapshot_write_fixture;

insert into public.course_assessment_outcomes (
  course_snapshot_id, assessment_item_id, learning_outcome_id
)
select fixture.base_snapshot_id, assessments.id, outcomes.id
from snapshot_write_fixture as fixture
join public.course_assessment_items as assessments
  on assessments.course_snapshot_id = fixture.base_snapshot_id
join public.course_learning_outcomes as outcomes
  on outcomes.course_snapshot_id = fixture.base_snapshot_id
 and outcomes.position = 1;

insert into public.course_rules (
  course_snapshot_id, academic_year_id, course_source_page_id,
  rule_kind, hardness, source_text, review_state, confidence
)
select
  base_snapshot_id, academic_year_id, source_page_id,
  'prerequisite', 'hard', 'Completed REQS1000', 'review', 0.88
from snapshot_write_fixture;

insert into public.course_rule_groups (
  course_rule_id, course_snapshot_id, projection_key, parent_group_id,
  operator, minimum_count, position
)
select
  rules.id, fixture.base_snapshot_id, 'prerequisite:group:root', null,
  'all_of', null, 0
from snapshot_write_fixture as fixture
join public.course_rules as rules
  on rules.course_snapshot_id = fixture.base_snapshot_id;

insert into public.course_rule_conditions (
  course_rule_id, course_snapshot_id, projection_key, group_id,
  condition_kind, required_course_id, course_requirement_mode, hardness,
  source_text, confidence, review_state, position
)
select
  rules.id, fixture.base_snapshot_id, 'prerequisite:condition:0', groups.id,
  'course', required.id, 'completed', 'hard', 'Completed REQS1000', 0.88,
  'review', 0
from snapshot_write_fixture as fixture
join public.course_rules as rules
  on rules.course_snapshot_id = fixture.base_snapshot_id
join public.course_rule_groups as groups on groups.course_rule_id = rules.id
join public.courses as required on required.code = 'REQS1000';

insert into public.course_rule_course_references (
  course_rule_id, course_snapshot_id, referenced_course_id, source_text,
  confidence, review_state
)
select
  rules.id, fixture.base_snapshot_id, required.id, 'Completed REQS1000',
  0.88, 'review'
from snapshot_write_fixture as fixture
join public.course_rules as rules
  on rules.course_snapshot_id = fixture.base_snapshot_id
join public.courses as required on required.code = 'REQS1000';

insert into public.academic_structures (code, kind)
values ('SNAP-PROG', 'programme');

insert into public.course_rules (
  course_snapshot_id, academic_year_id, course_source_page_id,
  rule_kind, hardness, source_text, review_state, confidence
)
select
  fixture.base_snapshot_id,
  fixture.academic_year_id,
  fixture.source_page_id,
  additional_rules.rule_kind,
  additional_rules.hardness,
  additional_rules.source_text,
  'review',
  0.88
from snapshot_write_fixture as fixture
cross join (values
  ('corequisite'::text, 'hard'::text, 'Concurrent REQS1000'::text),
  ('incompatibility', 'hard', 'Incompatible with REQS1000'),
  ('permission', 'hard', 'Permission of the convener'),
  ('assumed_knowledge', 'advisory', 'Admission to SNAP-PROG')
) as additional_rules(rule_kind, hardness, source_text);

insert into public.course_rule_groups (
  course_rule_id, course_snapshot_id, projection_key, parent_group_id,
  operator, minimum_count, position
)
select
  rules.id,
  fixture.base_snapshot_id,
  rules.rule_kind || ':group:root',
  null,
  'all_of',
  null,
  0
from snapshot_write_fixture as fixture
join public.course_rules as rules
  on rules.course_snapshot_id = fixture.base_snapshot_id
 and rules.rule_kind <> 'prerequisite';

insert into public.course_rule_conditions (
  course_rule_id, course_snapshot_id, projection_key, group_id,
  condition_kind, required_course_id, required_structure_id,
  course_requirement_mode, hardness, free_text, source_text, confidence,
  review_state, position
)
select
  rules.id,
  fixture.base_snapshot_id,
  rules.rule_kind || ':condition:0',
  groups.id,
  case rules.rule_kind
    when 'corequisite' then 'course'
    when 'incompatibility' then 'incompatible'
    when 'permission' then 'permission'
    else 'admission'
  end,
  case
    when rules.rule_kind in ('corequisite', 'incompatibility')
      then required_courses.id
    else null
  end,
  case
    when rules.rule_kind = 'assumed_knowledge' then structures.id
    else null
  end,
  case
    when rules.rule_kind = 'corequisite' then 'completed_or_concurrent'
    else null
  end,
  rules.hardness,
  case
    when rules.rule_kind = 'permission' then 'Permission of the convener'
    else null
  end,
  rules.source_text,
  0.88,
  'review',
  0
from snapshot_write_fixture as fixture
join public.course_rules as rules
  on rules.course_snapshot_id = fixture.base_snapshot_id
 and rules.rule_kind <> 'prerequisite'
join public.course_rule_groups as groups on groups.course_rule_id = rules.id
join public.courses as required_courses on required_courses.code = 'REQS1000'
join public.academic_structures as structures on structures.code = 'SNAP-PROG';

insert into public.course_rule_course_references (
  course_rule_id, course_snapshot_id, referenced_course_id, source_text,
  confidence, review_state
)
select
  rules.id, fixture.base_snapshot_id, required.id, rules.source_text,
  0.88, 'review'
from snapshot_write_fixture as fixture
join public.course_rules as rules
  on rules.course_snapshot_id = fixture.base_snapshot_id
 and rules.rule_kind <> 'prerequisite'
join public.courses as required on required.code = 'REQS1000';

insert into public.course_snapshot_field_evidence (
  course_snapshot_id, academic_year_id, source_page_id, entity_kind,
  entity_key, field_key, importance, extraction_state, confidence,
  confidence_band, verification_status, source_locator, evidence_excerpt
)
select
  base_snapshot_id, academic_year_id, source_page_id, 'course', 'root',
  'title', 'critical', 'present', 0.99, 'high', 'source_matched',
  'h1', 'Editable course'
from snapshot_write_fixture;

update public.course_years as course_years
set draft_snapshot_id = fixture.base_snapshot_id
from snapshot_write_fixture as fixture
where course_years.id = fixture.course_year_id;

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.ok(
  public.current_user_has_permission('courses.write')
  and not public.current_user_has_permission('courses.read_drafts')
  and not public.current_user_has_permission('catalogue.write')
  and not public.current_user_has_permission('imports.manage')
  and (
    select count(*) = 1
    from public.courses
    where code = 'EDIT1000'
  )
  and (
    select count(*) = 1
    from public.course_snapshots
    where id = (select base_snapshot_id from snapshot_write_fixture)
  )
  and (
    select count(*) = 1
    from public.course_source_pages
    where external_key = 'EDIT1000'
  )
  and (
    select count(*) = 1
    from public.course_fees
    where course_snapshot_id = (
      select base_snapshot_id from snapshot_write_fixture
    )
  )
  and (
    select count(*) = 1
    from public.offering_sessions
    where course_snapshot_id = (
      select base_snapshot_id from snapshot_write_fixture
    )
  )
  and (
    select count(*) = 5
    from public.course_rule_conditions
    where course_snapshot_id = (
      select base_snapshot_id from snapshot_write_fixture
    )
  )
  and (
    select count(*) = 1
    from public.course_snapshot_field_evidence
    where course_snapshot_id = (
      select base_snapshot_id from snapshot_write_fixture
    )
  )
  and (
    select count(*) = 1
    from public.academic_structures
    where code = 'SNAP-PROG'
  ),
  'courses.write alone can read a complete native draft projection'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

insert into public.course_import_runs (
  source_id, academic_year_id, status, requested_model, parser_version,
  prompt_version, schema_version, initiated_by, target_count
)
select
  sources.id, years.id, 'queued', 'test/model', 'test-parser', 'test-prompt',
  'course-snapshot.v1', '93000000-0000-4000-8000-000000000001', 2
from public.course_sources as sources
join public.academic_years as years on years.year = 2028
where sources.kind = 'snapshot_write_test';

insert into public.course_import_targets (
  run_id, source_id, academic_year_id, directory_entry_id, position,
  course_code, course_id, course_year_id, baseline_draft_snapshot_id
)
select
  runs.id, runs.source_id, runs.academic_year_id, entries.id, 1,
  entries.code, entries.course_id, fixture.course_year_id,
  fixture.base_snapshot_id
from public.course_import_runs as runs
join public.course_directory_entries as entries
  on entries.academic_year_id = runs.academic_year_id
join snapshot_write_fixture as fixture on true
where runs.requested_model = 'test/model';

insert into public.course_review_items (
  target_id, course_snapshot_id, entity_kind, entity_key, field_path,
  issue_code, importance, is_blocking, summary, new_value
)
select
  targets.id, fixture.base_snapshot_id, 'course', 'root', '$',
  'MANUAL_REVIEW_REQUIRED', 'high', true, 'Review before publication.',
  '{"review":true}'::jsonb
from public.course_import_targets as targets
join snapshot_write_fixture as fixture on true
where targets.course_code = 'EDIT1000';

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok(
  format(
    'select public.archive_course_year(%s, %s, null)',
    (select course_year_id from snapshot_write_fixture),
    (select base_snapshot_id from snapshot_write_fixture)
  ),
  '42501',
  'Course write permission is required.',
  'a student cannot archive a course year'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000001',
  true
);
select extensions.throws_ok(
  format(
    'select public.create_course_manual_snapshot(%s, %s, %L::jsonb)',
    (select course_year_id from snapshot_write_fixture),
    999999,
    private.course_snapshot_projection(
      (select base_snapshot_id from snapshot_write_fixture)
    )::text
  ),
  '40001',
  'The course draft changed while it was being edited.',
  'manual editing rejects a stale base pointer'
);

select extensions.throws_ok(
  format(
    'select public.create_course_manual_snapshot(%s, %s, %L::jsonb)',
    (select course_year_id from snapshot_write_fixture),
    (select base_snapshot_id from snapshot_write_fixture),
    jsonb_set(
      private.course_snapshot_projection(
        (select base_snapshot_id from snapshot_write_fixture)
      ),
      '{fees,0,sourceText}',
      'null'::jsonb
    )::text
  ),
  '22023',
  'A basic course collection contains invalid values.',
  'manual editing rejects a null nested field required by the native loader'
);

select extensions.throws_ok(
  format(
    'select public.create_course_manual_snapshot(%s, %s, %L::jsonb)',
    (select course_year_id from snapshot_write_fixture),
    (select base_snapshot_id from snapshot_write_fixture),
    jsonb_set(
      private.course_snapshot_projection(
        (select base_snapshot_id from snapshot_write_fixture)
      ),
      '{fees,0,audience}',
      'null'::jsonb
    )::text
  ),
  '22023',
  'A basic course collection contains invalid values.',
  'manual editing rejects a null required enum before any write'
);

select extensions.throws_ok(
  format(
    'select public.create_course_manual_snapshot(%s, %s, %L::jsonb)',
    (select course_year_id from snapshot_write_fixture),
    (select base_snapshot_id from snapshot_write_fixture),
    jsonb_set(
      private.course_snapshot_projection(
        (select base_snapshot_id from snapshot_write_fixture)
      ),
      '{fees,0,position}',
      '2'::jsonb
    )::text
  ),
  '22023',
  'Positioned course collections must use contiguous positions.',
  'manual editing rejects a gapped positioned collection before any write'
);

select extensions.throws_ok(
  format(
    'select public.create_course_manual_snapshot(%s, %s, %L::jsonb)',
    (select course_year_id from snapshot_write_fixture),
    (select base_snapshot_id from snapshot_write_fixture),
    jsonb_set(
      private.course_snapshot_projection(
        (select base_snapshot_id from snapshot_write_fixture)
      ),
      '{ruleConditions,0,hardness}',
      'null'::jsonb
    )::text
  ),
  '22023',
  'A course rule collection contains invalid values.',
  'manual editing rejects an invalid nested rule value before any write'
);

select extensions.throws_ok(
  format(
    'select public.create_course_manual_snapshot(%s, %s, %L::jsonb)',
    (select course_year_id from snapshot_write_fixture),
    (select base_snapshot_id from snapshot_write_fixture),
    (
      select jsonb_set(
        projection.value,
        '{ruleGroups}',
        projection.value -> 'ruleGroups' ||
          jsonb_build_array(projection.value -> 'ruleGroups' -> 0)
      )
      from (
        select private.course_snapshot_projection(
          (select base_snapshot_id from snapshot_write_fixture)
        ) as value
      ) as projection
    )::text
  ),
  '22023',
  'Course rule, group and condition keys must be unique.',
  'manual editing rejects duplicate rule-tree projection keys before inserts'
);

select extensions.throws_ok(
  format(
    'select public.publish_course_snapshot(%s, %s, null)',
    (select course_year_id from snapshot_write_fixture),
    (select base_snapshot_id from snapshot_write_fixture)
  ),
  '55000',
  'Resolve blocking review items before publishing this course.',
  'publication rejects an unresolved blocking review item'
);

reset role;

create temporary table manual_snapshot_result as
select public.create_course_manual_snapshot(
  fixture.course_year_id,
  fixture.base_snapshot_id,
  jsonb_set(
    private.course_snapshot_projection(fixture.base_snapshot_id),
    '{snapshot,description}',
    '"Updated description"'::jsonb
  )
) as snapshot_id
from snapshot_write_fixture as fixture;

select extensions.ok(
  exists (
    select 1
    from manual_snapshot_result as result
    join public.course_snapshots as snapshots on snapshots.id = result.snapshot_id
    join snapshot_write_fixture as fixture on true
    join public.course_years as course_years on course_years.id = fixture.course_year_id
    where snapshots.origin = 'manual_edit'
      and snapshots.based_on_snapshot_id = fixture.base_snapshot_id
      and snapshots.sealed_at is not null
      and not snapshots.has_critical_uncertainty
      and course_years.draft_snapshot_id = snapshots.id
      and course_years.published_snapshot_id is null
  ),
  'manual editing installs a sealed draft with explicit lineage'
);

select extensions.is(
  (
    select private.course_snapshot_projection(result.snapshot_id)
    from manual_snapshot_result as result
  ),
  (
    select jsonb_set(
      private.course_snapshot_projection(fixture.base_snapshot_id),
      '{snapshot,description}',
      '"Updated description"'::jsonb
    )
    from snapshot_write_fixture as fixture
  ),
  'the complete relational manual projection round-trips exactly'
);

select extensions.ok(
  (
    select count(*) = 2
    from public.course_unit_options as options
    join manual_snapshot_result as result
      on result.snapshot_id = options.course_snapshot_id
  )
  and (
    select count(*) = 1
    from public.course_fees as fees
    join manual_snapshot_result as result
      on result.snapshot_id = fees.course_snapshot_id
  )
  and (
    select count(*) = 1
    from public.offering_sessions as sessions
    join manual_snapshot_result as result
      on result.snapshot_id = sessions.course_snapshot_id
  )
  and (
    select count(*) = 2
    from public.course_learning_outcomes as outcomes
    join manual_snapshot_result as result
      on result.snapshot_id = outcomes.course_snapshot_id
  ),
  'manual editing deep-copies every non-rule child collection'
);

select extensions.ok(
  (
    select count(*) = 5
    from public.course_rules as rules
    join manual_snapshot_result as result
      on result.snapshot_id = rules.course_snapshot_id
  )
  and (
    select count(*) = 5
    from public.course_rule_groups as groups
    join manual_snapshot_result as result
      on result.snapshot_id = groups.course_snapshot_id
  )
  and (
    select count(*) = 5
    from public.course_rule_conditions as conditions
    join manual_snapshot_result as result
      on result.snapshot_id = conditions.course_snapshot_id
  )
  and (
    select count(*) = 5
    from public.course_rule_course_references as rule_references
    join manual_snapshot_result as result
      on result.snapshot_id = rule_references.course_snapshot_id
  )
  and exists (
    select 1
    from public.course_rules as rules
    join public.course_rule_conditions as conditions
      on conditions.course_rule_id = rules.id
    join public.academic_structures as structures
      on structures.id = conditions.required_structure_id
    join manual_snapshot_result as result
      on result.snapshot_id = rules.course_snapshot_id
    where rules.rule_kind = 'assumed_knowledge'
      and conditions.condition_kind = 'admission'
      and structures.code = 'SNAP-PROG'
  ),
  'manual editing remaps every supported rule kind and structure reference'
);

select extensions.ok(
  exists (
    select 1
    from public.course_snapshot_field_evidence as evidence
    join manual_snapshot_result as result
      on result.snapshot_id = evidence.course_snapshot_id
    where evidence.entity_kind = 'course'
      and evidence.field_key = 'title'
      and evidence.verification_status = 'source_matched'
  )
  and exists (
    select 1
    from public.course_snapshot_field_evidence as evidence
    join manual_snapshot_result as result
      on result.snapshot_id = evidence.course_snapshot_id
    where evidence.entity_kind = 'manual_edit'
      and evidence.field_key = '$.snapshot.description'
      and evidence.verification_status = 'human_confirmed'
      and evidence.confidence = 1
  ),
  'manual editing preserves source evidence and records human confirmation'
);

select extensions.is(
  (
    select snapshots.description
    from public.course_snapshots as snapshots
    join snapshot_write_fixture as fixture
      on fixture.base_snapshot_id = snapshots.id
  ),
  'Original description',
  'the sealed base snapshot remains unchanged'
);

select extensions.throws_ok(
  format(
    'select public.create_course_manual_snapshot(%s, %s, %L::jsonb)',
    (select course_year_id from snapshot_write_fixture),
    (select snapshot_id from manual_snapshot_result),
    private.course_snapshot_projection(
      (select snapshot_id from manual_snapshot_result)
    )::text
  ),
  '22023',
  'No canonical course fields changed.',
  'ordinary no-op manual saves are rejected'
);

select extensions.ok(
  exists (
    select 1
    from public.course_review_items as reviews
    join snapshot_write_fixture as fixture
      on fixture.base_snapshot_id = reviews.course_snapshot_id
    where reviews.status = 'open'
      and reviews.is_blocking
  ),
  'ordinary manual saves leave inherited blocking review work untouched'
);

select extensions.throws_ok(
  format(
    'select public.publish_course_snapshot(%s, %s, null)',
    (select course_year_id from snapshot_write_fixture),
    (select snapshot_id from manual_snapshot_result)
  ),
  '55000',
  'Resolve blocking review items before publishing this course.',
  'publication checks unresolved blockers across manual snapshot ancestry'
);

create temporary table manual_confirmation_result as
select public.confirm_course_manual_snapshot(
  fixture.course_year_id,
  result.snapshot_id,
  private.course_snapshot_projection(result.snapshot_id),
  array(
    select reviews.id
    from public.course_review_items as reviews
    where reviews.course_snapshot_id = fixture.base_snapshot_id
      and reviews.status = 'open'
      and reviews.is_blocking
    order by reviews.id
  ),
  'Reviewed the blocking import item against the ANU source.'
) as confirmation
from snapshot_write_fixture as fixture
cross join manual_snapshot_result as result;

select extensions.ok(
  exists (
    select 1
    from manual_confirmation_result as result
    join public.course_snapshot_confirmations as confirmations
      on confirmations.id = (result.confirmation ->> 'confirmationId')::uuid
    join public.course_snapshot_confirmation_items as items
      on items.confirmation_id = confirmations.id
    join public.course_review_items as reviews
      on reviews.id = items.review_item_id
    where (result.confirmation ->> 'snapshotId')::bigint =
        (select snapshot_id from manual_snapshot_result)
      and confirmations.confirmation_note =
        'Reviewed the blocking import item against the ANU source.'
      and reviews.status = 'accepted'
      and reviews.resolution_note =
        'Reviewed the blocking import item against the ANU source.'
  ),
  'explicit confirmation resolves the exact blocker and records a durable note'
);

select extensions.throws_ok(
  format(
    'select public.publish_course_snapshot(%s, %s, %s)',
    (select course_year_id from snapshot_write_fixture),
    (select snapshot_id from manual_snapshot_result),
    999999
  ),
  '40001',
  'The published course changed while it was being reviewed.',
  'publication rejects a stale published pointer'
);

select pg_temp.approve_catalogue_fixture('course', snapshot_id) from manual_snapshot_result;

select extensions.lives_ok(
  format(
    'select public.publish_course_snapshot(%s, %s, null)',
    (select course_year_id from snapshot_write_fixture),
    (select snapshot_id from manual_snapshot_result)
  ),
  'an administrator can publish the current reviewed manual draft'
);

select extensions.ok(
  exists (
    select 1
    from public.course_years as course_years
    join snapshot_write_fixture as fixture on fixture.course_year_id = course_years.id
    join manual_snapshot_result as result on true
    where course_years.published_snapshot_id = result.snapshot_id
      and course_years.draft_snapshot_id is null
  ),
  'publication swaps the published pointer and clears the draft atomically'
);

insert into public.plans (
  owner_id,
  academic_year_id,
  name,
  is_primary,
  status,
  commencement_year,
  study_load
)
select
  '93000000-0000-4000-8000-000000000001',
  academic_years.id,
  'Archive protection plan',
  true,
  'active',
  2028,
  'full_time'
from public.academic_years as academic_years
where academic_years.year = 2028;

create temporary table archive_plan_item_fixture as
select public.add_current_user_plan_item(
  'EDIT1000'::text,
  2028::smallint,
  null::smallint,
  null::text
) as plan_item_id;

select extensions.throws_ok(
  format(
    'select public.archive_course_year(%s, null, null)',
    (select course_year_id from snapshot_write_fixture)
  ),
  '40001',
  'The course changed while it was being archived.',
  'archival rejects stale snapshot pointers'
);

select extensions.throws_ok(
  format(
    'select public.archive_course_year(%s, null, %s)',
    (select course_year_id from snapshot_write_fixture),
    (select snapshot_id from manual_snapshot_result)
  ),
  '55000',
  'This course year cannot be archived while it is referenced by a student plan.',
  'archival rejects a course year that is still used by a student plan'
);

select extensions.ok(
  exists (
    select 1
    from public.course_years as course_years
    join snapshot_write_fixture as fixture
      on fixture.course_year_id = course_years.id
    join public.plan_items as plan_items
      on plan_items.course_id = course_years.course_id
     and plan_items.academic_year_id = course_years.academic_year_id
    where course_years.lifecycle_status = 'active'
      and plan_items.id = (
        select plan_item_id from archive_plan_item_fixture
      )
  ),
  'a rejected archive preserves both the active course year and its plan item'
);

delete from public.plan_items
where id = (select plan_item_id from archive_plan_item_fixture);

select extensions.lives_ok(
  format(
    'select public.archive_course_year(%s, null, %s)',
    (select course_year_id from snapshot_write_fixture),
    (select snapshot_id from manual_snapshot_result)
  ),
  'an administrator can archive a course year with current pointers'
);

select extensions.ok(
  exists (
    select 1
    from public.course_years as course_years
    join snapshot_write_fixture as fixture on fixture.course_year_id = course_years.id
    join manual_snapshot_result as result on true
    where course_years.lifecycle_status = 'archived'
      and course_years.published_snapshot_id = result.snapshot_id
      and course_years.draft_snapshot_id is null
  ),
  'archival preserves immutable snapshot history and pointers'
);

select extensions.throws_ok(
  format(
    'update public.course_years set draft_snapshot_id = %s where id = %s',
    (select base_snapshot_id from snapshot_write_fixture),
    (select course_year_id from snapshot_write_fixture)
  ),
  '55000',
  'Archived course years are immutable.',
  'an archived course year cannot later accept a draft pointer change'
);

select extensions.throws_ok(
  $sql$
    insert into public.plan_items (
      plan_id,
      owner_id,
      course_id,
      academic_year_id,
      sort_order
    )
    select
      plans.id,
      plans.owner_id,
      course_years.course_id,
      course_years.academic_year_id,
      0
    from public.plans as plans
    cross join snapshot_write_fixture as fixture
    join public.course_years as course_years
      on course_years.id = fixture.course_year_id
    where plans.owner_id = '93000000-0000-4000-8000-000000000001'
      and plans.name = 'Archive protection plan'
  $sql$,
  '55000',
  'Plan items can reference only active course years.',
  'trusted writes cannot add a plan item after its course year is archived'
);

reset role;

insert into public.course_snapshots (
  course_year_id, academic_year_id, snapshot_number, origin,
  source_page_id, projection_sha256, validation_status,
  has_critical_uncertainty, title, unit_value_kind, units, level,
  subject_code, offering_status, created_by
)
select
  course_years.id, years.id, 1, 'import', documents.id, repeat('2', 64),
  'valid_with_warnings', true, 'Critical course', 'fixed', 6, 1000,
  'CRIT', 'unknown', '93000000-0000-4000-8000-000000000001'
from public.course_years
join public.courses on courses.id = course_years.course_id
join public.academic_years as years on years.id = course_years.academic_year_id
join public.course_source_pages as documents
  on documents.academic_year_id = years.id
 and documents.external_key = courses.code
where courses.code = 'CRIT1000';

insert into public.course_snapshot_field_evidence (
  course_snapshot_id, academic_year_id, source_page_id,
  entity_kind, entity_key, field_key, importance, extraction_state,
  confidence, confidence_band, verification_status, note
)
select
  snapshots.id,
  snapshots.academic_year_id,
  snapshots.source_page_id,
  'course',
  'root',
  'title',
  'critical',
  'present',
  0.4,
  'low',
  'model_only',
  'The model title still requires human review.'
from public.course_snapshots as snapshots
join public.course_years on course_years.id = snapshots.course_year_id
join public.courses on courses.id = course_years.course_id
where courses.code = 'CRIT1000';

update public.course_years as course_years
set draft_snapshot_id = snapshots.id
from public.course_snapshots as snapshots
join public.courses on true
where snapshots.course_year_id = course_years.id
  and courses.id = course_years.course_id
  and courses.code = 'CRIT1000';

insert into public.course_directory_entries (
  academic_year_id, course_id, code, title, units, source_page_id
)
select
  years.id,
  courses.id,
  courses.code,
  'Critical course',
  6,
  documents.id
from public.academic_years as years
join public.courses on courses.code = 'CRIT1000'
join public.course_source_pages as documents
  on documents.academic_year_id = years.id
 and documents.page_kind = 'course_directory'
where years.year = 2028;

insert into public.course_import_targets (
  run_id, source_id, academic_year_id, directory_entry_id, position,
  course_code, course_id, course_year_id
)
select
  runs.id,
  runs.source_id,
  runs.academic_year_id,
  entries.id,
  2,
  entries.code,
  entries.course_id,
  course_years.id
from public.course_import_runs as runs
join public.course_directory_entries as entries
  on entries.academic_year_id = runs.academic_year_id
 and entries.code = 'CRIT1000'
join public.course_years on course_years.course_id = entries.course_id
where runs.requested_model = 'test/model';

insert into public.course_review_items (
  target_id, course_snapshot_id, entity_kind, entity_key, field_path,
  issue_code, importance, is_blocking, summary, new_value
)
select
  targets.id,
  snapshots.id,
  'course',
  'root',
  reviews.field_path,
  reviews.issue_code,
  reviews.importance,
  reviews.is_blocking,
  reviews.summary,
  to_jsonb(snapshots.title)
from public.course_import_targets as targets
join public.courses on courses.id = targets.course_id
join public.course_snapshots as snapshots
  on snapshots.course_year_id = targets.course_year_id
cross join (values
  (
    '$.snapshot.title'::text,
    'CRITICAL_CONFIRMATION_TEST'::text,
    'critical'::text,
    true,
    'Confirm the critical course title.'::text
  ),
  (
    '$.snapshot.description'::text,
    'NON_BLOCKING_REVIEW_TEST'::text,
    'normal'::text,
    false,
    'Review the descriptive wording later.'::text
  )
) as reviews(field_path, issue_code, importance, is_blocking, summary)
where courses.code = 'CRIT1000';

select extensions.throws_ok(
  format(
    'select public.publish_course_snapshot(%s, %s, null)',
    course_years.id,
    snapshots.id
  ),
  '55000',
  'Resolve blocking review items before publishing this course.',
  'critical imported drafts cannot be published directly'
)
from public.course_years
join public.courses on courses.id = course_years.course_id
join public.course_snapshots as snapshots
  on snapshots.id = course_years.draft_snapshot_id
where courses.code = 'CRIT1000';

reset role;

create temporary table critical_manual_edit as
select public.create_course_manual_snapshot(
  course_years.id,
  snapshots.id,
  jsonb_set(
    private.course_snapshot_projection(snapshots.id),
    '{snapshot,description}',
    '"Administrator corrected description"'::jsonb
  )
) as snapshot_id
from public.course_years
join public.courses on courses.id = course_years.course_id
join public.course_snapshots as snapshots
  on snapshots.id = course_years.draft_snapshot_id
where courses.code = 'CRIT1000';

select extensions.ok(
  exists (
    select 1
    from critical_manual_edit as manual
    join public.course_snapshots as snapshots on snapshots.id = manual.snapshot_id
    join public.course_snapshot_field_evidence as evidence
      on evidence.course_snapshot_id = snapshots.id
    where snapshots.has_critical_uncertainty
      and evidence.field_key = 'title'
      and evidence.verification_status = 'model_only'
      and evidence.confidence = 0.4
  )
  and exists (
    select 1
    from public.course_review_items as reviews
    where reviews.issue_code in (
      'CRITICAL_CONFIRMATION_TEST',
      'NON_BLOCKING_REVIEW_TEST'
    )
      and reviews.status = 'open'
    group by reviews.target_id
    having count(*) = 2
  )
  and exists (
    select 1
    from critical_manual_edit as manual
    join public.course_snapshot_field_evidence as evidence
      on evidence.course_snapshot_id = manual.snapshot_id
    where evidence.field_key = '$.snapshot.description'
      and evidence.verification_status = 'human_confirmed'
  ),
  'ordinary edits confirm only changed fields and preserve uncertainty, model evidence and review work'
);

select extensions.throws_ok(
  format(
    'select public.confirm_course_manual_snapshot(%s, %s, %L::jsonb, %L::uuid[], %L)',
    course_years.id,
    manual.snapshot_id,
    private.course_snapshot_projection(manual.snapshot_id)::text,
    '{}'::uuid[]::text,
    ''
  ),
  '22023',
  'A confirmation note is required.',
  'explicit confirmation requires a nonblank audit note'
)
from public.course_years
join public.courses on courses.id = course_years.course_id
cross join critical_manual_edit as manual
where courses.code = 'CRIT1000';

select extensions.throws_ok(
  format(
    'select public.confirm_course_manual_snapshot(%s, %s, %L::jsonb, %L::uuid[], %L)',
    course_years.id,
    manual.snapshot_id,
    private.course_snapshot_projection(manual.snapshot_id)::text,
    '{}'::uuid[]::text,
    'Reviewed a stale selection.'
  ),
  '40001',
  'The blocking review selection changed. Refresh and confirm the exact open items.',
  'explicit confirmation requires the exact current blocking review-item set'
)
from public.course_years
join public.courses on courses.id = course_years.course_id
cross join critical_manual_edit as manual
where courses.code = 'CRIT1000';

create temporary table critical_confirmation as
select public.confirm_course_manual_snapshot(
  course_years.id,
  manual.snapshot_id,
  private.course_snapshot_projection(manual.snapshot_id),
  array(
    select reviews.id
    from public.course_review_items as reviews
    where reviews.issue_code = 'CRITICAL_CONFIRMATION_TEST'
      and reviews.status = 'open'
      and reviews.is_blocking
    order by reviews.id
  ),
  'Checked the blocking title evidence against the source page.'
) as confirmation
from public.course_years
join public.courses on courses.id = course_years.course_id
cross join critical_manual_edit as manual
where courses.code = 'CRIT1000';

select extensions.ok(
  exists (
    select 1
    from critical_confirmation as result
    join public.course_snapshots as snapshots
      on snapshots.id = (result.confirmation ->> 'snapshotId')::bigint
    join public.course_snapshot_confirmations as confirmations
      on confirmations.id = (result.confirmation ->> 'confirmationId')::uuid
    join public.course_snapshot_confirmation_items as items
      on items.confirmation_id = confirmations.id
    join public.course_review_items as reviews
      on reviews.id = items.review_item_id
    where not snapshots.has_critical_uncertainty
      and reviews.issue_code = 'CRITICAL_CONFIRMATION_TEST'
      and reviews.status = 'accepted'
      and reviews.resolution_note =
        'Checked the blocking title evidence against the source page.'
  )
  and exists (
    select 1
    from public.course_review_items as reviews
    where reviews.issue_code = 'NON_BLOCKING_REVIEW_TEST'
      and reviews.status = 'open'
      and not reviews.is_blocking
  )
  and exists (
    select 1
    from critical_confirmation as result
    join public.course_snapshot_field_evidence as evidence
      on evidence.course_snapshot_id =
        (result.confirmation ->> 'snapshotId')::bigint
    where evidence.field_key = 'title'
      and evidence.verification_status = 'model_only'
      and evidence.confidence = 0.4
  )
  and not exists (
    select 1
    from critical_confirmation as result
    join public.course_snapshot_field_evidence as evidence
      on evidence.course_snapshot_id =
        (result.confirmation ->> 'snapshotId')::bigint
    where evidence.field_key = '$'
  ),
  'explicit confirmation resolves only named blockers and does not upgrade unrelated evidence or review items'
);

select extensions.ok(
  (
    select snapshots.projection_sha256 =
      private.course_snapshot_projection_sha256(
        private.course_snapshot_projection(snapshots.id)
      )
    from critical_confirmation as result
    join public.course_snapshots as snapshots
      on snapshots.id = (result.confirmation ->> 'snapshotId')::bigint
  ),
  'manual snapshot hashes use the canonical semantic projection'
);

select * from extensions.finish();

rollback;
