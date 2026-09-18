begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

select extensions.is(
  (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'academic_years',
        'catalogue_items',
        'catalogue_item_years',
        'catalogue_snapshots',
        'catalogue_sources',
        'catalogue_source_pages',
        'course_snapshot_details'
      )
  ),
  7::bigint,
  'the shared catalogue and course detail tables exist'
);

select extensions.hasnt_table(
  'public',
  'course_versions',
  'the legacy course_versions table is absent'
);

select extensions.hasnt_table(
  'public',
  'catalogue_directory_courses',
  'the legacy catalogue course directory is absent'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'public'
      and relations.relname in (
        'academic_years',
        'catalogue_items',
        'catalogue_item_years',
        'catalogue_snapshots',
        'catalogue_sources',
        'catalogue_source_pages',
        'course_snapshot_details',
        'course_offerings',
        'offering_sessions',
        'course_learning_outcomes',
        'course_assessment_items',
        'course_assessment_outcomes',
        'requirement_rules',
        'requirement_groups',
        'requirement_conditions',
        'requirement_condition_options',
        'requirement_item_references'
      )
      and relations.relrowsecurity
  ),
  17::bigint,
  'RLS is enabled on every exposed catalogue and course table'
);

select extensions.has_function(
  'public',
  'published_course_detail',
  array['text', 'smallint'],
  'published course detail requires an explicit academic year'
);

select extensions.hasnt_function(
  'public',
  'published_course_detail',
  array['text'],
  'implicit latest-year course detail is absent'
);

select extensions.has_function(
  'public',
  'published_requirement_graph',
  array['text', 'smallint'],
  'published prerequisite graphs require an explicit academic year'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.add_current_user_plan_item(text,smallint,smallint,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.add_current_user_plan_item(text,smallint,smallint,text)',
    'execute'
  ),
  'the explicit-year planner RPC is authenticated-only'
);

select * from extensions.finish();

rollback;
