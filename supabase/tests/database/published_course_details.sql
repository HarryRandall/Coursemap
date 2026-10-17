begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(5);

select pg_temp.publish_course('COMP1100', 2026::smallint, 'Programming as Problem Solving');
select pg_temp.publish_course('MATH1013', 2026::smallint, 'Mathematics and Applications 1');

-- COMP1110 needs COMP1100, so both courses carry a prerequisite edge.
with snapshot as (
  select pg_temp.create_course_snapshot(
    'COMP1110', 2026::smallint, 'Structured Programming', 'fixed', 6, null, null, 1000::smallint
  ) as version_id
), rule as (
  insert into public.requirement_rules (version_id, academic_year_id, rule_kind, source_text)
  select snapshot.version_id, academic_years.id, 'prerequisite', 'Requires COMP1100'
  from snapshot, public.academic_years
  where academic_years.year = 2026
  returning id, version_id
), reference as (
  insert into public.requirement_item_references (rule_id, version_id, code_id, source_text)
  select rule.id, rule.version_id, codes.id, 'COMP1100'
  from rule, public.catalogue_codes as codes
  where codes.code = 'COMP1100' and codes.kind = 'course'
  returning version_id
)
select pg_temp.publish_snapshot(version_id) from reference;

select extensions.ok(
  has_function_privilege('anon', 'public.published_course_details(text[],smallint)', 'execute')
  and has_function_privilege('authenticated', 'public.published_course_details(text[],smallint)', 'execute'),
  'public readers can read course details in batches'
);

select extensions.results_eq(
  $$
    select course_code, detail
    from public.published_course_details(
      array['comp1110', ' COMP1100 ', 'MATH1013', 'NONE1000', 'COMP1100'], 2026::smallint
    )
    order by course_code
  $$,
  $$
    select code, public.published_course_detail(code, 2026::smallint)
    from unnest(array['COMP1100', 'COMP1110', 'MATH1013']) as code
    order by code
  $$,
  'each batched detail matches the single-course read, normalising and dropping unknown codes'
);

select extensions.is(
  (
    select jsonb_array_length(detail->'prerequisiteEdges')
    from public.published_course_details(array['COMP1100'], 2026::smallint)
  ),
  1,
  'a batched detail includes the prerequisite edges out of the course'
);

select extensions.is_empty(
  $$ select * from public.published_course_details(array['COMP1100'], 2025::smallint) $$,
  'other academic years are not read'
);

select extensions.is(
  (
    select count(*)::int
    from public.published_course_details(
      array_cat(array(select 'NONE' || g from generate_series(1000, 1059) as g), array['COMP1100']),
      2026::smallint
    )
  ),
  0,
  'codes past the fiftieth are ignored'
);

select * from extensions.finish();
rollback;
