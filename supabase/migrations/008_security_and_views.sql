-- Coursemap baseline, part 8 of 8: public reads and admin views
--
-- The read surface. The published_* functions are the only route to
-- catalogue content for an anonymous reader, and they resolve published
-- immutable versions alone -- never the latest version, never a draft, never
-- a source version. The admin_* views exist so an administrator screen can
-- read the private role tables without being granted them.
--
-- These come last because they span every part above.

create or replace function public.published_course_availability(p_course_code text, p_academic_year smallint) returns table(course_code text, academic_year smallint, is_available boolean, course_id bigint, course_year_id bigint, published_version_id bigint, offering_status text)
    language sql stable
    set search_path to ''
    as $$
  select
    upper(btrim(p_course_code)) as course_code,
    p_academic_year as academic_year,
    item_years.published_version_id is not null as is_available,
    items.id as course_id,
    item_years.id as course_year_id,
    item_years.published_version_id,
    details.offering_status
  from (values (true)) as request(single_row)
  left join public.catalogue_codes as items
    on items.kind = 'course'
   and items.code = upper(btrim(p_course_code))
  left join public.academic_years
    on academic_years.year = p_academic_year
  left join public.catalogue_records as item_years
    on item_years.code_id = items.id
   and item_years.academic_year_id = academic_years.id
   and item_years.archived_at is null
  left join public.course_version_details as details
    on details.version_id = item_years.published_version_id;
$$;

create or replace function public.published_requirement_graph(p_course_code text, p_academic_year smallint) returns table(from_code text, to_code text, from_is_available boolean, to_is_available boolean)
    language sql stable
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

create or replace function public.published_structure_detail(p_structure_code text, p_academic_year smallint) returns jsonb
    language sql stable security definer
    set search_path to ''
    as $$
  -- Security definer so the private projection is callable; the CTE selects
  -- only the published snapshot, so no draft content can be reached.
  with selected as (
    select item_years.published_version_id as version_id
    from public.catalogue_codes as items
    join public.catalogue_records as item_years
      on item_years.code_id = items.id
     and item_years.archived_at is null
    join public.academic_years
      on academic_years.id = item_years.academic_year_id
     and academic_years.year = p_academic_year
    where items.kind in ('programme', 'major', 'minor', 'specialisation')
      and items.code = upper(btrim(p_structure_code))
      and item_years.published_version_id is not null
    limit 1
  )
  select private.structure_version_projection(selected.version_id)
    || jsonb_build_object('snapshotId', selected.version_id)
  from selected;
$$;

create or replace function public.published_structure_years(p_structure_code text) returns table(academic_year smallint, structure_kind text)
    language sql stable security definer
    set search_path to ''
    as $$
  select
    academic_years.year as academic_year,
    items.kind as structure_kind
  from public.catalogue_codes as items
  join public.catalogue_records as item_years
    on item_years.code_id = items.id
   and item_years.archived_at is null
   and item_years.published_version_id is not null
  join public.academic_years on academic_years.id = item_years.academic_year_id
  where items.kind in ('programme', 'major', 'minor', 'specialisation')
    and items.code = upper(btrim(p_structure_code))
  order by academic_years.year desc;
$$;

create or replace function public.published_course_detail(p_course_code text, p_academic_year smallint) returns jsonb
    language sql stable security definer
    set search_path to ''
    as $$
  with selected as (
    select
      item_years.published_version_id as version_id,
      items.code as course_code,
      academic_years.year as academic_year
    from public.catalogue_codes as items
    join public.catalogue_records as item_years
      on item_years.code_id = items.id
     and item_years.archived_at is null
    join public.academic_years
      on academic_years.id = item_years.academic_year_id
     and academic_years.year = p_academic_year
    where items.kind = 'course'
      and items.code = upper(btrim(p_course_code))
      and item_years.published_version_id is not null
    limit 1
  )
  select private.course_version_projection(selected.version_id)
    || jsonb_build_object(
      'code', selected.course_code,
      'snapshotId', selected.version_id,
      'prerequisiteEdges', coalesce((
        select jsonb_agg(jsonb_build_object(
          'from', graph.from_code, 'to', graph.to_code,
          'fromIsAvailable', graph.from_is_available, 'toIsAvailable', graph.to_is_available
        ) order by graph.from_code, graph.to_code)
        from public.published_requirement_graph(selected.course_code, selected.academic_year) as graph
      ), '[]'::jsonb)
    )
  from selected;
$$;

create or replace view public.admin_permissions with (security_invoker='true') as
 select id as permission_id,
    key as permission_key,
    name as permission_name,
    description as permission_description,
    category as permission_category
   from private.app_permissions permissions
  where ( select private.has_permission('admin.access'::text) as has_permission);

create or replace view public.admin_role_permissions with (security_invoker='true') as
 select role_id,
    permission_id
   from private.role_permissions role_permissions
  where ( select private.has_permission('admin.access'::text) as has_permission);

create or replace view public.admin_roles with (security_invoker='true') as
 select roles.key as role_key,
    roles.name as role_name,
    COALESCE(array_agg(permissions.key order by permissions.key) FILTER (where (permissions.key is not null)), array[]::text[]) as permission_keys,
    roles.id as role_id,
    roles.description as role_description
   from ((private.app_roles roles
     left join private.role_permissions role_permissions on ((role_permissions.role_id = roles.id)))
     left join private.app_permissions permissions on ((permissions.id = role_permissions.permission_id)))
  where ( select private.has_permission('admin.access'::text) as has_permission)
  group by roles.id, roles.key, roles.name, roles.description;

create or replace view public.admin_user_roles with (security_invoker='true') as
 select user_roles.user_id,
    roles.key as role_key,
    user_roles.granted_by,
    user_roles.granted_at
   from (private.user_roles user_roles
     join private.app_roles roles on ((roles.id = user_roles.role_id)))
  where ( select private.has_permission('admin.access'::text) as has_permission);

create or replace view public.admin_users with (security_invoker='true') as
 select id as user_id,
    email,
    display_name,
    created_at,
    updated_at,
    student_number
   from public.profiles profiles
  where ( select private.has_permission('admin.access'::text) as has_permission);

create or replace view public.catalogue_directory_entries with (security_invoker='true') as
 select id,
    academic_year_id,
    kind,
    code,
    title,
    code_id,
    source_page_id,
    summary,
    is_current,
    first_seen_at,
    last_seen_at,
    record_id
   from public.catalogue_listings;

create or replace view public.published_course_summaries with (security_invoker='true') as
 select snapshots.id as version_id,
    items.id as code_id,
    items.code,
    item_years.id as record_id,
    item_years.academic_year_id,
    academic_years.year as academic_year,
    details.title,
    details.unit_value_kind,
    details.units,
    details.minimum_units,
    details.maximum_units,
    details.eftsl,
    details.level,
    details.subject_code,
    details.subject_name,
    details.school,
    details.college,
    details.academic_career,
    details.convener_text,
    details.delivery_summary,
    details.introduction,
    details.description,
    details.workload_text,
    details.workload_hours,
    details.inherent_requirements,
    details.prescribed_texts,
    details.offering_status,
    details.source_updated_at
   from ((((public.catalogue_records item_years
     join public.catalogue_codes items on ((items.id = item_years.code_id)))
     join public.academic_years on ((academic_years.id = item_years.academic_year_id)))
     join public.catalogue_versions snapshots on ((snapshots.id = item_years.published_version_id)))
     join public.course_version_details details on ((details.version_id = snapshots.id)))
  where ((item_years.kind = 'course'::text) and (item_years.archived_at is null));

comment on view public.admin_permissions is 'Admin-only permission catalogue used by the editable role matrix.';

comment on view public.admin_role_permissions is 'Admin-only projection of current role-level permission grants.';

comment on view public.admin_roles is 'Admin-only role catalogue with descriptions and effective permission keys.';

comment on view public.admin_user_roles is 'Admin-only projection of current application role assignments.';

comment on view public.admin_users is 'Admin-only projection of Coursemap profiles for account and study-plan support.';

-- Every object is taken back to nothing before it is granted anything, so the
-- grants below are the whole of what each role holds rather than an addition
-- to whatever Supabase's defaults already handed out.

revoke all on function public.published_course_availability(p_course_code text, p_academic_year smallint) from public, anon, authenticated, service_role;

revoke all on function public.published_course_detail(p_course_code text, p_academic_year smallint) from public, anon, authenticated, service_role;

revoke all on function public.published_requirement_graph(p_course_code text, p_academic_year smallint) from public, anon, authenticated, service_role;

revoke all on function public.published_structure_detail(p_structure_code text, p_academic_year smallint) from public, anon, authenticated, service_role;

revoke all on function public.published_structure_years(p_structure_code text) from public, anon, authenticated, service_role;

revoke all on table public.admin_permissions from public, anon, authenticated, service_role;

revoke all on table public.admin_role_permissions from public, anon, authenticated, service_role;

revoke all on table public.admin_roles from public, anon, authenticated, service_role;

revoke all on table public.admin_user_roles from public, anon, authenticated, service_role;

revoke all on table public.admin_users from public, anon, authenticated, service_role;

revoke all on table public.catalogue_directory_entries from public, anon, authenticated, service_role;

revoke all on table public.published_course_summaries from public, anon, authenticated, service_role;

revoke all on function public.published_course_availability(p_course_code text, p_academic_year smallint) from public;

grant all on function public.published_course_availability(p_course_code text, p_academic_year smallint) to anon;

grant all on function public.published_course_availability(p_course_code text, p_academic_year smallint) to authenticated;

grant all on function public.published_course_availability(p_course_code text, p_academic_year smallint) to service_role;

revoke all on function public.published_course_detail(p_course_code text, p_academic_year smallint) from public;

grant all on function public.published_course_detail(p_course_code text, p_academic_year smallint) to anon;

grant all on function public.published_course_detail(p_course_code text, p_academic_year smallint) to authenticated;

grant all on function public.published_course_detail(p_course_code text, p_academic_year smallint) to service_role;

revoke all on function public.published_requirement_graph(p_course_code text, p_academic_year smallint) from public;

grant all on function public.published_requirement_graph(p_course_code text, p_academic_year smallint) to anon;

grant all on function public.published_requirement_graph(p_course_code text, p_academic_year smallint) to authenticated;

grant all on function public.published_requirement_graph(p_course_code text, p_academic_year smallint) to service_role;

revoke all on function public.published_structure_detail(p_structure_code text, p_academic_year smallint) from public;

grant all on function public.published_structure_detail(p_structure_code text, p_academic_year smallint) to anon;

grant all on function public.published_structure_detail(p_structure_code text, p_academic_year smallint) to authenticated;

grant all on function public.published_structure_detail(p_structure_code text, p_academic_year smallint) to service_role;

revoke all on function public.published_structure_years(p_structure_code text) from public;

grant all on function public.published_structure_years(p_structure_code text) to anon;

grant all on function public.published_structure_years(p_structure_code text) to authenticated;

grant all on function public.published_structure_years(p_structure_code text) to service_role;

grant select on table public.admin_permissions to authenticated;

grant select on table public.admin_role_permissions to authenticated;

grant select on table public.admin_roles to authenticated;

grant select on table public.admin_user_roles to authenticated;

grant select on table public.admin_users to authenticated;

grant all on table public.catalogue_directory_entries to service_role;

grant select on table public.catalogue_directory_entries to authenticated;

grant all on table public.published_course_summaries to service_role;

grant select on table public.published_course_summaries to anon;

grant select on table public.published_course_summaries to authenticated;
