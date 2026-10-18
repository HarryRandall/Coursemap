begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;
select extensions.plan(10);

create function pg_temp.graph_course(
  p_code text, p_year smallint, p_sources text[],
  p_edge_kind text default 'reference', p_publish boolean default true,
  p_rule_kind text default 'prerequisite'
) returns bigint language plpgsql set search_path = '' as $$
declare
  fixture_version_id bigint := pg_temp.create_course_snapshot(p_code, p_year);
  fixture_rule_id bigint;
  fixture_group_id bigint;
  fixture_condition_id bigint;
  fixture_source_id bigint;
  fixture_source_code text;
  fixture_position integer := 0;
begin
  insert into public.requirement_rules(version_id, academic_year_id, rule_kind, source_text)
  select fixture_version_id, versions.academic_year_id, p_rule_kind, 'Graph fixture'
  from public.catalogue_versions as versions where versions.id = fixture_version_id
  returning id into fixture_rule_id;
  insert into public.requirement_groups(rule_id, version_id, group_key, operator)
  values(fixture_rule_id, fixture_version_id, 'root', 'all_of') returning id into fixture_group_id;
  foreach fixture_source_code in array p_sources loop
    fixture_position := fixture_position + 1;
    insert into public.catalogue_codes(kind, code) values('course', fixture_source_code)
    on conflict(kind, code) do update set code = excluded.code returning id into fixture_source_id;
    if p_edge_kind = 'reference' then
      insert into public.requirement_item_references(rule_id, version_id, code_id, source_text)
      values(fixture_rule_id, fixture_version_id, fixture_source_id, fixture_source_code);
    else
      insert into public.requirement_conditions(rule_id, version_id, group_id, condition_key,
        position, condition_kind, code_id, item_kind, requirement_mode, minimum_units)
      values(fixture_rule_id, fixture_version_id, fixture_group_id, fixture_source_code, fixture_position,
        case when p_edge_kind = 'condition' then 'course' else 'course_set_units' end,
        case when p_edge_kind = 'condition' then fixture_source_id end,
        case when p_edge_kind = 'condition' then 'course' end,
        case when p_edge_kind = 'condition' then 'completed' end,
        case when p_edge_kind = 'option' then 6 end)
      returning id into fixture_condition_id;
      if p_edge_kind = 'option' then
        insert into public.requirement_condition_options(condition_id, version_id, position, kind, code, code_id)
        values(fixture_condition_id, fixture_version_id, 1, 'course', fixture_source_code, fixture_source_id);
      end if;
    end if;
  end loop;
  if p_publish then perform pg_temp.publish_snapshot(fixture_version_id); end if;
  return fixture_version_id;
end;
$$;

select pg_temp.graph_course('FAST1100', 2028::smallint, array['FAST1000']);
select pg_temp.graph_course('FAST2400', 2028::smallint, array['FAST1100']);
select pg_temp.graph_course('FAST3400', 2028::smallint, array['FAST2400'], 'condition');
select pg_temp.graph_course('FAST3410', 2028::smallint, array['FAST2400'], 'option');
select pg_temp.graph_course('FAST4400', 2028::smallint, array['FAST3400']);
select pg_temp.graph_course('FAST9999', 2028::smallint, array['FAST9900']);
select pg_temp.graph_course('FAST6666', 2028::smallint, array['FAST2400'], 'reference', false);
select pg_temp.graph_course('FAST2400', 2028::smallint, array['FAST7777'], 'reference', false);
select pg_temp.graph_course('FAST3500', 2028::smallint, array['FAST2400']) as archived_version \gset
update public.catalogue_records set archived_at = now() where published_version_id = :archived_version;
select pg_temp.graph_course('FAST3600', 2028::smallint, array['FAST2400'], 'reference', true, 'corequisite');
select pg_temp.graph_course('FAST2400', 2029::smallint, array['FAST2000']);
select pg_temp.graph_course('LOOP1100', 2028::smallint, array['LOOP1200']);
select pg_temp.graph_course('LOOP1200', 2028::smallint, array['LOOP1100']);

set constraints all immediate;
set local role anon;
select extensions.results_eq(
  $$select from_code, to_code, from_is_available, to_is_available
    from public.published_requirement_graph('FAST2400', 2028::smallint)$$,
  $$values ('FAST1000'::text, 'FAST1100'::text, false, true),
           ('FAST1100', 'FAST2400', true, true),
           ('FAST2400', 'FAST3400', true, true),
           ('FAST2400', 'FAST3410', true, true)$$,
  'anonymous readers get upstream references and direct condition/option dependants only'
);
select extensions.is(
  (select count(*) from public.published_requirement_graph(' fast2400 ', 2028::smallint)),
  4::bigint, 'course codes are normalised'
);
select extensions.results_eq(
  $$select from_code, to_code from public.published_requirement_graph('FAST2400', 2029::smallint)$$,
  $$values ('FAST2000'::text, 'FAST2400'::text)$$,
  'the selected year controls both publication and edges'
);
select extensions.is_empty(
  $$select * from public.published_requirement_graph('FAST6666', 2028::smallint)$$,
  'an unpublished root exposes no graph'
);
select extensions.is_empty(
  $$select * from public.published_requirement_graph('FAST3500', 2028::smallint)$$,
  'an archived root exposes no graph'
);
select extensions.is_empty(
  $$select * from public.published_requirement_graph('MISS1000', 2028::smallint)$$,
  'an unknown root exposes no graph'
);
select extensions.is(
  (select count(*) from public.published_requirement_graph('LOOP1100', 2028::smallint)),
  2::bigint, 'cycles terminate with distinct edges'
);
reset role;
set local role authenticated;
select extensions.is(
  (select count(*) from public.published_requirement_graph('FAST2400', 2028::smallint)),
  4::bigint, 'authenticated readers use the same published boundary'
);
reset role;
select extensions.ok(
  (select prosecdef from pg_proc where oid = 'public.published_requirement_graph(text,smallint)'::regprocedure),
  'the bounded public projection avoids repeated editorial RLS work'
);
select extensions.ok(
  not exists (
    select 1 from aclexplode((select proacl from pg_proc
      where oid = 'public.published_requirement_graph(text,smallint)'::regprocedure))
    where grantee = 0 and privilege_type = 'EXECUTE'
  ), 'graph execution has no implicit PUBLIC grant'
);
select * from extensions.finish();
rollback;
