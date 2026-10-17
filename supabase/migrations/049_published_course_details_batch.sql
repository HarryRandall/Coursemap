-- Reads many published course details in one call. published_course_detail
-- rebuilds the year's whole prerequisite edge set for every course, so a plan
-- of forty courses paid for forty edge scans and forty round trips. This
-- builds the edges once and walks them from every requested course.
create or replace function public.published_course_details(p_course_codes text[], p_academic_year smallint)
returns table(course_code text, detail jsonb)
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
  -- Bounded so a public caller cannot make one statement walk every course.
  requested as (
    select distinct upper(btrim(code)) as code
    from unnest(p_course_codes[1:50]) as code
  ),
  roots as (
    select distinct on (items.id)
      items.id as code_id, items.code, published_snapshots.version_id
    from requested
    join public.catalogue_codes as items
      on items.code = requested.code and items.kind = 'course'
    join published_snapshots on published_snapshots.code_id = items.id
    order by items.id, published_snapshots.version_id
  ),
  edges as materialized (
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
    select roots.code_id as root_id, edges.from_item_id, edges.to_item_id
    from edges join roots on roots.code_id = edges.to_item_id
    union
    select upstream.root_id, edges.from_item_id, edges.to_item_id
    from edges join upstream on upstream.from_item_id = edges.to_item_id
  ),
  graph_edges as (
    select upstream.root_id, upstream.from_item_id, upstream.to_item_id from upstream
    union
    select roots.code_id, edges.from_item_id, edges.to_item_id
    from edges join roots on roots.code_id = edges.from_item_id
  ),
  graphs as (
    select
      graph_edges.root_id,
      jsonb_agg(jsonb_build_object(
        'from', source_items.code, 'to', target_items.code,
        'fromIsAvailable', source_availability.code_id is not null,
        'toIsAvailable', target_availability.code_id is not null
      ) order by source_items.code, target_items.code) as prerequisite_edges
    from graph_edges
    join public.catalogue_codes as source_items on source_items.id = graph_edges.from_item_id
    join public.catalogue_codes as target_items on target_items.id = graph_edges.to_item_id
    left join published_snapshots as source_availability
      on source_availability.code_id = graph_edges.from_item_id
    left join published_snapshots as target_availability
      on target_availability.code_id = graph_edges.to_item_id
    group by graph_edges.root_id
  )
  select
    roots.code,
    private.course_version_projection(roots.version_id)
      || jsonb_build_object(
        'code', roots.code,
        'snapshotId', roots.version_id,
        'prerequisiteEdges', coalesce(graphs.prerequisite_edges, '[]'::jsonb)
      )
  from roots
  left join graphs on graphs.root_id = roots.code_id;
$$;

comment on function public.published_course_details(text[], smallint) is
  'Published course details for up to 50 codes in one academic year, matching published_course_detail for each.';

revoke all on function public.published_course_details(text[], smallint) from public, anon, authenticated, service_role;
grant execute on function public.published_course_details(text[], smallint) to anon, authenticated, service_role;
