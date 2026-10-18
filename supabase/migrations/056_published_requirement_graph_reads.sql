-- Project only live published course versions before traversing prerequisites.
-- This is the same public boundary as published_course_detail: evaluating the
-- per-row editorial policies while assembling the graph exceeds the API timeout.
create or replace function public.published_requirement_graph(p_course_code text, p_academic_year smallint) returns table(from_code text, to_code text, from_is_available boolean, to_is_available boolean)
    language sql stable security definer
    set search_path to ''
    as $$
  with recursive
  published_snapshots as (
    select item_years.code_id, item_years.published_version_id as version_id
    from public.catalogue_records as item_years
    join public.academic_years
      on academic_years.id = item_years.academic_year_id
     and academic_years.year = p_academic_year
    where item_years.kind = 'course'
      and item_years.archived_at is null
      and item_years.published_version_id is not null
  ),
  root as (
    select published_snapshots.code_id
    from published_snapshots
    join public.catalogue_codes as items on items.id = published_snapshots.code_id
    where items.code = upper(btrim(p_course_code))
    limit 1
  ),
  edges as (
    select item_references.code_id as from_item_id, published_snapshots.code_id as to_item_id
    from public.requirement_item_references as item_references
    join public.requirement_rules as rules on rules.id = item_references.rule_id
    join published_snapshots on published_snapshots.version_id = rules.version_id
    where rules.rule_kind = 'prerequisite'
    union
    select conditions.code_id, published_snapshots.code_id
    from public.requirement_conditions as conditions
    join public.requirement_rules as rules on rules.id = conditions.rule_id
    join published_snapshots on published_snapshots.version_id = rules.version_id
    where rules.rule_kind = 'prerequisite'
      and conditions.condition_kind = 'course'
      and conditions.code_id is not null
    union
    select options.code_id, published_snapshots.code_id
    from public.requirement_condition_options as options
    join public.requirement_conditions as conditions on conditions.id = options.condition_id
    join public.requirement_rules as rules on rules.id = conditions.rule_id
    join published_snapshots on published_snapshots.version_id = rules.version_id
    where rules.rule_kind = 'prerequisite'
      and options.kind = 'course'
      and options.code_id is not null
  ),
  upstream as (
    select edges.from_item_id, edges.to_item_id from edges
    join root on root.code_id = edges.to_item_id
    union
    select edges.from_item_id, edges.to_item_id from edges
    join upstream on upstream.from_item_id = edges.to_item_id
  ),
  graph_edges as (
    select upstream.from_item_id, upstream.to_item_id from upstream
    union
    select edges.from_item_id, edges.to_item_id from edges
    join root on root.code_id = edges.from_item_id
  )
  select
    source_items.code as from_code,
    target_items.code as to_code,
    source_availability.code_id is not null as from_is_available,
    target_availability.code_id is not null as to_is_available
  from graph_edges
  join public.catalogue_codes as source_items on source_items.id = graph_edges.from_item_id
  join public.catalogue_codes as target_items on target_items.id = graph_edges.to_item_id
  left join published_snapshots as source_availability
    on source_availability.code_id = graph_edges.from_item_id
  left join published_snapshots as target_availability
    on target_availability.code_id = graph_edges.to_item_id
  order by source_items.code, target_items.code;
$$;

revoke all on function public.published_requirement_graph(text, smallint) from public;
grant execute on function public.published_requirement_graph(text, smallint) to anon, authenticated, service_role;
