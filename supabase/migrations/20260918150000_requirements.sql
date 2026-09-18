begin;

-- One requirement model for every catalogue kind. Course requisites
-- (prerequisite, corequisite, incompatibility, permission, assumed knowledge)
-- and structure completion requirements are rules on a snapshot, each holding
-- one nested tree of groups and typed conditions. This replaces the
-- course_rule_* family and the academic_structure_requirement_* family, whose
-- vocabularies had drifted apart. Development cutover: the seed repopulates.

drop function public.published_course_requisite_graph(text, smallint);

-- Tables ------------------------------------------------------------------------------

create table public.requirement_rules (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null,
  academic_year_id bigint not null,
  source_page_id bigint,
  rule_kind text not null,
  hardness text not null default 'hard',
  source_text text not null,
  source_locator text,
  review_state text not null default 'automatic',
  confidence numeric(5, 4) not null default 1,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint requirement_rules_snapshot_kind_unique unique (snapshot_id, rule_kind),
  constraint requirement_rules_id_snapshot_unique unique (id, snapshot_id),
  constraint requirement_rules_snapshot_fkey
    foreign key (snapshot_id, academic_year_id)
    references public.catalogue_snapshots (id, academic_year_id) on delete cascade,
  constraint requirement_rules_source_page_fkey
    foreign key (source_page_id, academic_year_id)
    references public.catalogue_source_pages (id, academic_year_id),
  constraint requirement_rules_kind_check check (
    rule_kind in (
      'prerequisite', 'corequisite', 'incompatibility', 'permission',
      'assumed_knowledge', 'structure'
    )
  ),
  constraint requirement_rules_hardness_check check (hardness in ('hard', 'advisory')),
  constraint requirement_rules_source_text_check check (btrim(source_text) <> ''),
  constraint requirement_rules_review_state_check check (
    review_state in ('automatic', 'verified', 'review')
  ),
  constraint requirement_rules_confidence_check check (confidence between 0 and 1),
  constraint requirement_rules_position_check check (position >= 0)
);

create index requirement_rules_snapshot_idx on public.requirement_rules (snapshot_id);

-- label carries structure headings such as "Major" or "Electives"; unit bounds
-- express "24 to 48 units from" on structure groups.
create table public.requirement_groups (
  id bigint generated always as identity primary key,
  rule_id bigint not null,
  snapshot_id bigint not null,
  parent_group_id bigint,
  group_key text not null,
  label text,
  description text,
  operator text not null,
  minimum_count smallint,
  minimum_units numeric(7, 2),
  maximum_units numeric(7, 2),
  source_text text,
  source_locator text,
  position integer not null default 0,
  constraint requirement_groups_key_unique unique (snapshot_id, group_key),
  constraint requirement_groups_id_rule_unique unique (id, rule_id),
  constraint requirement_groups_id_snapshot_unique unique (id, snapshot_id),
  constraint requirement_groups_rule_fkey
    foreign key (rule_id, snapshot_id)
    references public.requirement_rules (id, snapshot_id) on delete cascade,
  constraint requirement_groups_parent_fkey
    foreign key (parent_group_id, rule_id)
    references public.requirement_groups (id, rule_id) on delete cascade,
  constraint requirement_groups_not_self_parent_check check (
    parent_group_id is null or parent_group_id <> id
  ),
  constraint requirement_groups_operator_check check (
    operator in ('all_of', 'any_of', 'at_least')
  ),
  constraint requirement_groups_minimum_count_check check (
    (operator = 'at_least' and minimum_count is not null and minimum_count > 0)
    or (operator <> 'at_least' and minimum_count is null)
  ),
  constraint requirement_groups_units_check check (
    (minimum_units is null or minimum_units > 0)
    and (maximum_units is null or maximum_units > 0)
    and (minimum_units is null or maximum_units is null or maximum_units >= minimum_units)
  ),
  constraint requirement_groups_key_check check (btrim(group_key) <> ''),
  constraint requirement_groups_label_check check (label is null or btrim(label) <> ''),
  constraint requirement_groups_position_check check (position >= 0)
);

create index requirement_groups_rule_idx on public.requirement_groups (rule_id, position);

create table public.requirement_conditions (
  id bigint generated always as identity primary key,
  rule_id bigint not null,
  snapshot_id bigint not null,
  group_id bigint not null,
  condition_key text not null,
  position integer not null default 0,
  condition_kind text not null,
  item_id bigint,
  structure_kind text,
  requirement_mode text,
  minimum_mark numeric(5, 2),
  minimum_units numeric(7, 2),
  maximum_units numeric(7, 2),
  minimum_count smallint,
  subject_code text,
  minimum_level smallint,
  maximum_level smallint,
  minimum_year smallint,
  minimum_gpa numeric(3, 2),
  minimum_wam numeric(5, 2),
  tag text,
  free_text text,
  hardness text not null default 'hard',
  source_text text,
  source_locator text,
  review_state text not null default 'automatic',
  confidence numeric(5, 4) not null default 1,
  constraint requirement_conditions_key_unique unique (snapshot_id, condition_key),
  constraint requirement_conditions_group_position_unique unique (group_id, position),
  constraint requirement_conditions_id_snapshot_unique unique (id, snapshot_id),
  constraint requirement_conditions_rule_fkey
    foreign key (rule_id, snapshot_id)
    references public.requirement_rules (id, snapshot_id) on delete cascade,
  constraint requirement_conditions_group_fkey
    foreign key (group_id, rule_id)
    references public.requirement_groups (id, rule_id) on delete cascade,
  constraint requirement_conditions_item_fkey
    foreign key (item_id) references public.catalogue_items (id),
  constraint requirement_conditions_kind_check check (
    condition_kind in (
      'course', 'incompatible', 'structure', 'structure_set', 'course_set_units',
      'units_total', 'subject_units', 'level_units', 'tagged_units',
      'elective_units', 'year_standing', 'gpa', 'wam', 'permission', 'other'
    )
  ),
  constraint requirement_conditions_structure_kind_check check (
    structure_kind is null
    or structure_kind in ('programme', 'major', 'minor', 'specialisation')
  ),
  constraint requirement_conditions_requirement_mode_check check (
    (condition_kind = 'course' and requirement_mode in ('completed', 'completed_or_concurrent'))
    or (condition_kind <> 'course' and requirement_mode is null)
  ),
  constraint requirement_conditions_typed_value_check check (
    case condition_kind
      when 'course' then item_id is not null
      when 'incompatible' then item_id is not null
      when 'structure' then item_id is not null or free_text is not null
      when 'structure_set' then structure_kind is not null
      when 'course_set_units' then minimum_units is not null or minimum_count is not null
      when 'units_total' then minimum_units is not null
      when 'subject_units' then subject_code is not null and minimum_units is not null
      when 'level_units' then minimum_level is not null and minimum_units is not null
      when 'tagged_units' then tag is not null and minimum_units is not null
      when 'elective_units' then minimum_units is not null
      when 'year_standing' then minimum_year is not null
      when 'gpa' then minimum_gpa is not null
      when 'wam' then minimum_wam is not null
      when 'permission' then free_text is not null
      when 'other' then free_text is not null
    end
  ),
  constraint requirement_conditions_units_check check (
    (minimum_units is null or minimum_units >= 0)
    and (maximum_units is null or maximum_units >= 0)
    and (minimum_units is null or maximum_units is null or maximum_units >= minimum_units)
  ),
  constraint requirement_conditions_minimum_count_check check (
    minimum_count is null or minimum_count > 0
  ),
  constraint requirement_conditions_subject_code_check check (
    subject_code is null or subject_code ~ '^[A-Z]{4}$'
  ),
  constraint requirement_conditions_levels_check check (
    (minimum_level is null or minimum_level between 0 and 9999)
    and (maximum_level is null or maximum_level between 0 and 9999)
    and (minimum_level is null or maximum_level is null or maximum_level >= minimum_level)
  ),
  constraint requirement_conditions_minimum_mark_check check (
    minimum_mark is null or minimum_mark between 0 and 100
  ),
  constraint requirement_conditions_minimum_year_check check (
    minimum_year is null or minimum_year between 1 and 10
  ),
  constraint requirement_conditions_minimum_gpa_check check (
    minimum_gpa is null or minimum_gpa between 0 and 7
  ),
  constraint requirement_conditions_minimum_wam_check check (
    minimum_wam is null or minimum_wam between 0 and 100
  ),
  constraint requirement_conditions_hardness_check check (hardness in ('hard', 'advisory')),
  constraint requirement_conditions_review_state_check check (
    review_state in ('automatic', 'verified', 'review')
  ),
  constraint requirement_conditions_confidence_check check (confidence between 0 and 1),
  constraint requirement_conditions_key_check check (btrim(condition_key) <> ''),
  constraint requirement_conditions_position_check check (position >= 0)
);

create index requirement_conditions_rule_idx on public.requirement_conditions (rule_id);
create index requirement_conditions_item_idx on public.requirement_conditions (item_id)
  where item_id is not null;

-- Members of set-based conditions. item_id is null when the code has no
-- catalogue identity yet; code is always kept as the source wrote it.
create table public.requirement_condition_options (
  id bigint generated always as identity primary key,
  condition_id bigint not null,
  snapshot_id bigint not null,
  position integer not null,
  kind text not null,
  code text not null,
  item_id bigint,
  title text,
  source_text text,
  constraint requirement_condition_options_code_unique unique (condition_id, code),
  constraint requirement_condition_options_position_unique unique (condition_id, position),
  constraint requirement_condition_options_condition_fkey
    foreign key (condition_id, snapshot_id)
    references public.requirement_conditions (id, snapshot_id) on delete cascade,
  constraint requirement_condition_options_item_fkey
    foreign key (item_id, kind) references public.catalogue_items (id, kind),
  constraint requirement_condition_options_kind_check check (
    kind in ('course', 'programme', 'major', 'minor', 'specialisation')
  ),
  constraint requirement_condition_options_code_check check (
    case kind
      when 'course' then code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'
      else code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'
    end
  ),
  constraint requirement_condition_options_position_check check (position > 0)
);

create index requirement_condition_options_item_idx
  on public.requirement_condition_options (item_id) where item_id is not null;

-- Flattened item references per rule for graph queries and placeholder access.
create table public.requirement_item_references (
  id bigint generated always as identity primary key,
  rule_id bigint not null,
  snapshot_id bigint not null,
  item_id bigint not null,
  source_text text not null,
  confidence numeric(5, 4) not null default 0,
  review_state text not null default 'review',
  constraint requirement_item_references_unique unique (rule_id, item_id),
  constraint requirement_item_references_rule_fkey
    foreign key (rule_id, snapshot_id)
    references public.requirement_rules (id, snapshot_id) on delete cascade,
  constraint requirement_item_references_item_fkey
    foreign key (item_id) references public.catalogue_items (id),
  constraint requirement_item_references_source_text_check check (btrim(source_text) <> ''),
  constraint requirement_item_references_confidence_check check (confidence between 0 and 1),
  constraint requirement_item_references_review_state_check check (
    review_state in ('automatic', 'verified', 'review')
  )
);

create index requirement_item_references_item_idx
  on public.requirement_item_references (item_id);

-- Integrity ---------------------------------------------------------------------------

-- Every rule owns exactly one connected, acyclic group tree.
create or replace function private.validate_requirement_tree()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  old_rule_id bigint;
  new_rule_id bigint;
  target_rule_id bigint;
  root_count integer;
  group_count integer;
  reachable_count integer;
begin
  if tg_table_name = 'requirement_rules' then
    if tg_op <> 'INSERT' then old_rule_id := old.id; end if;
    if tg_op <> 'DELETE' then new_rule_id := new.id; end if;
  else
    if tg_op <> 'INSERT' then old_rule_id := old.rule_id; end if;
    if tg_op <> 'DELETE' then new_rule_id := new.rule_id; end if;
  end if;

  for target_rule_id in
    select distinct candidates.id
    from unnest(array[old_rule_id, new_rule_id]) as candidates(id)
    where candidates.id is not null
  loop
    if exists (select 1 from public.requirement_rules where id = target_rule_id) then
      select count(*) into root_count
      from public.requirement_groups
      where rule_id = target_rule_id and parent_group_id is null;

      if root_count <> 1 then
        raise exception 'requirement tree must contain exactly one root'
          using errcode = '23514', constraint = 'requirement_groups_exactly_one_root_check';
      end if;

      select count(*) into group_count
      from public.requirement_groups where rule_id = target_rule_id;

      with recursive reachable (id) as (
        select groups.id from public.requirement_groups as groups
        where groups.rule_id = target_rule_id and groups.parent_group_id is null
        union
        select children.id from public.requirement_groups as children
        join reachable on children.parent_group_id = reachable.id
        where children.rule_id = target_rule_id
      )
      select count(*) into reachable_count from reachable;

      if reachable_count <> group_count then
        raise exception 'requirement tree must be connected and acyclic'
          using errcode = '23514', constraint = 'requirement_groups_tree_shape_check';
      end if;
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function private.validate_requirement_tree() from public, anon, authenticated;

create constraint trigger requirement_rules_validate_tree
after insert or update on public.requirement_rules
deferrable initially deferred
for each row execute function private.validate_requirement_tree();

create constraint trigger requirement_groups_validate_tree
after insert or update or delete on public.requirement_groups
deferrable initially deferred
for each row execute function private.validate_requirement_tree();

-- A resolved option must name the item it points at, and members belong to
-- set-based conditions only.
create or replace function private.validate_requirement_condition_option()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.requirement_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.condition_kind in ('course_set_units', 'structure_set')
  ) then
    raise exception 'requirement options belong to course_set_units or structure_set conditions'
      using errcode = '23503';
  end if;

  if new.item_id is not null and not exists (
    select 1 from public.catalogue_items
    where id = new.item_id and kind = new.kind and code = new.code
  ) then
    raise exception 'requirement option item does not match its code'
      using errcode = '23503';
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_requirement_condition_option()
from public, anon, authenticated;

create trigger requirement_condition_options_validate
before insert or update on public.requirement_condition_options
for each row execute function private.validate_requirement_condition_option();

do $$
declare
  child text;
begin
  foreach child in array array[
    'requirement_rules',
    'requirement_groups',
    'requirement_conditions',
    'requirement_condition_options',
    'requirement_item_references'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I '
      'for each row execute function private.guard_snapshot_child_mutation()',
      child || '_guard_sealed', child
    );
    execute format('alter table public.%I enable row level security', child);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated '
      'using ((select private.can_read_snapshot(snapshot_id)))',
      child || '_read', child
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      'with check ((select private.can_manage_catalogue()))',
      child || '_admin_insert', child
    );
    execute format('grant select, insert on table public.%I to authenticated, service_role', child);
    execute format('grant select on table public.%I to anon', child);
  end loop;
end;
$$;

-- Remove both old models ----------------------------------------------------------------

drop table
  public.course_rule_condition_courses,
  public.course_rule_course_references,
  public.course_rule_conditions,
  public.course_rule_groups,
  public.course_rules,
  public.academic_structure_requirement_options,
  public.academic_structure_requirement_conditions,
  public.academic_structure_requirement_groups,
  public.academic_structure_unmodelled_requirements,
  public.academic_structure_summary_fields;

drop function private.validate_course_rule_tree();
drop function private.validate_course_rule_condition_course();

-- Access helper: placeholders referenced by published requirements stay visible.
create or replace function private.can_read_catalogue_item(p_item_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_manage_catalogue()
    or exists (
      select 1
      from public.catalogue_item_years as item_years
      where item_years.item_id = p_item_id
        and item_years.published_snapshot_id is not null
        and item_years.archived_at is null
    )
    or exists (
      select 1
      from public.requirement_conditions as conditions
      where conditions.item_id = p_item_id
        and private.is_published_snapshot(conditions.snapshot_id)
    )
    or exists (
      select 1
      from public.requirement_condition_options as options
      where options.item_id = p_item_id
        and private.is_published_snapshot(options.snapshot_id)
    )
    or exists (
      select 1
      from public.requirement_item_references as item_references
      where item_references.item_id = p_item_id
        and private.is_published_snapshot(item_references.snapshot_id)
    )
    or exists (
      select 1
      from public.course_related_courses as related
      where related.related_course_id = p_item_id
        and private.is_published_snapshot(related.snapshot_id)
    )
    or exists (
      select 1
      from public.course_attempts as attempts
      where attempts.course_id = p_item_id
        and attempts.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.plan_items
      where plan_items.course_id = p_item_id
        and plan_items.owner_id = (select auth.uid())
    );
$function$;

-- Projections ---------------------------------------------------------------------------

-- The requirement part of a snapshot projection, shared by every kind.
create or replace function private.requirement_projection(p_snapshot_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', rules.rule_kind,
        'ruleKind', rules.rule_kind,
        'hardness', rules.hardness,
        'sourceText', rules.source_text,
        'reviewState', rules.review_state,
        'confidence', rules.confidence
      ) order by rules.position, case rules.rule_kind
        when 'prerequisite' then 1 when 'corequisite' then 2
        when 'incompatibility' then 3 when 'permission' then 4
        when 'assumed_knowledge' then 5 else 6 end)
      from public.requirement_rules as rules
      where rules.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'ruleGroups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', groups.group_key,
        'ruleKey', rules.rule_kind,
        'parentGroupKey', parents.group_key,
        'operator', groups.operator,
        'minimumCount', groups.minimum_count,
        'minimumUnits', groups.minimum_units,
        'maximumUnits', groups.maximum_units,
        'label', groups.label,
        'description', groups.description,
        'sourceText', groups.source_text,
        'position', groups.position
      ) order by rules.rule_kind, groups.position, groups.id)
      from public.requirement_groups as groups
      join public.requirement_rules as rules on rules.id = groups.rule_id
      left join public.requirement_groups as parents on parents.id = groups.parent_group_id
      where groups.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'ruleConditions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', conditions.condition_key,
        'ruleKey', rules.rule_kind,
        'groupKey', groups.group_key,
        'position', conditions.position,
        'conditionKind', conditions.condition_kind,
        'requiredCourseCode', case
          when conditions.condition_kind in ('course', 'incompatible') then items.code
        end,
        'requiredStructureCode', case
          when conditions.condition_kind = 'structure' then items.code
        end,
        'structureKind', conditions.structure_kind,
        'minimumUnits', conditions.minimum_units,
        'maximumUnits', conditions.maximum_units,
        'minimumCount', conditions.minimum_count,
        'minimumMark', conditions.minimum_mark,
        'subjectCode', conditions.subject_code,
        'minimumCourseLevel', conditions.minimum_level,
        'maximumCourseLevel', conditions.maximum_level,
        'minimumGpa', conditions.minimum_gpa,
        'minimumYear', conditions.minimum_year,
        'minimumWam', conditions.minimum_wam,
        'tag', conditions.tag,
        'freeText', conditions.free_text,
        'courseRequirementMode', conditions.requirement_mode,
        'hardness', conditions.hardness,
        'sourceText', conditions.source_text,
        'reviewState', conditions.review_state,
        'confidence', conditions.confidence
      ) order by rules.rule_kind, conditions.position, conditions.id)
      from public.requirement_conditions as conditions
      join public.requirement_rules as rules on rules.id = conditions.rule_id
      join public.requirement_groups as groups on groups.id = conditions.group_id
      left join public.catalogue_items as items on items.id = conditions.item_id
      where conditions.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'ruleConditionCourses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'conditionKey', conditions.condition_key,
        'position', options.position,
        'kind', options.kind,
        'sourceCourseCode', options.code,
        'title', options.title,
        'sourceText', options.source_text
      ) order by conditions.id, options.position)
      from public.requirement_condition_options as options
      join public.requirement_conditions as conditions on conditions.id = options.condition_id
      where options.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'ruleCourseReferences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ruleKey', rules.rule_kind,
        'referencedCourseCode', items.code,
        'sourceText', item_references.source_text,
        'reviewState', item_references.review_state,
        'confidence', item_references.confidence
      ) order by rules.rule_kind, items.code)
      from public.requirement_item_references as item_references
      join public.requirement_rules as rules on rules.id = item_references.rule_id
      join public.catalogue_items as items on items.id = item_references.item_id
      where item_references.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'prerequisiteCodes', coalesce((
      select jsonb_agg(codes.code order by codes.code)
      from (
        select items.code
        from public.requirement_item_references as item_references
        join public.requirement_rules as rules on rules.id = item_references.rule_id
        join public.catalogue_items as items on items.id = item_references.item_id
        where rules.snapshot_id = p_snapshot_id and rules.rule_kind = 'prerequisite'
        union
        select items.code
        from public.requirement_conditions as conditions
        join public.requirement_rules as rules on rules.id = conditions.rule_id
        join public.catalogue_items as items on items.id = conditions.item_id
        where rules.snapshot_id = p_snapshot_id
          and rules.rule_kind = 'prerequisite'
          and conditions.condition_kind = 'course'
        union
        select options.code
        from public.requirement_condition_options as options
        join public.requirement_conditions as conditions on conditions.id = options.condition_id
        join public.requirement_rules as rules on rules.id = conditions.rule_id
        where rules.snapshot_id = p_snapshot_id
          and rules.rule_kind = 'prerequisite'
          and options.kind = 'course'
      ) as codes
    ), '[]'::jsonb)
  );
$function$;

revoke all on function private.requirement_projection(bigint) from public, anon, authenticated;

create or replace function private.course_snapshot_projection(p_snapshot_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with selected_snapshot as (
    select
      snapshots.id,
      snapshots.item_year_id,
      snapshots.academic_year_id,
      snapshots.origin,
      snapshots.source_page_id,
      snapshots.created_at,
      snapshots.sealed_at,
      details.*,
      items.code as course_code,
      academic_years.year as academic_year
    from public.catalogue_snapshots as snapshots
    join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
    join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
    join public.catalogue_items as items on items.id = item_years.item_id
    join public.academic_years on academic_years.id = snapshots.academic_year_id
    where snapshots.id = p_snapshot_id
  )
  select jsonb_build_object(
    'courseCode', snapshot.course_code,
    'academicYear', snapshot.academic_year,
    'origin', snapshot.origin,
    'snapshot', jsonb_build_object(
      'title', snapshot.title,
      'unitValueKind', snapshot.unit_value_kind,
      'units', snapshot.units,
      'minimumUnits', snapshot.minimum_units,
      'maximumUnits', snapshot.maximum_units,
      'eftsl', snapshot.eftsl,
      'level', snapshot.level,
      'subjectCode', snapshot.subject_code,
      'subjectName', snapshot.subject_name,
      'school', snapshot.school,
      'college', snapshot.college,
      'academicCareer', snapshot.academic_career,
      'convenerText', snapshot.convener_text,
      'deliverySummary', snapshot.delivery_summary,
      'introduction', snapshot.introduction,
      'description', snapshot.description,
      'workloadText', snapshot.workload_text,
      'workloadHours', snapshot.workload_hours,
      'inherentRequirements', snapshot.inherent_requirements,
      'prescribedTexts', snapshot.prescribed_texts,
      'offeringStatus', snapshot.offering_status,
      'sourceUpdatedAt', snapshot.source_updated_at
    ),
    'unitOptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', options.position, 'units', options.units,
        'label', options.label, 'sourceText', options.source_text
      ) order by options.position)
      from public.course_unit_options as options where options.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', fees.position, 'feeYear', fees.fee_year, 'audience', fees.audience,
        'feeType', fees.fee_type, 'amount', fees.amount, 'currency', fees.currency,
        'basis', fees.basis, 'studentContributionBand', fees.student_contribution_band,
        'sourceLabel', fees.source_label, 'sourceText', fees.source_text
      ) order by fees.position)
      from public.course_fees as fees where fees.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'areasOfInterest', coalesce((
      select jsonb_agg(jsonb_build_object('position', areas.position, 'name', areas.name)
        order by areas.position)
      from public.course_areas_of_interest as areas where areas.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'attributes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', attributes.position, 'attributeKind', attributes.attribute_kind,
        'value', attributes.value, 'sourceText', attributes.source_text
      ) order by attributes.position)
      from public.course_attributes as attributes where attributes.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'relatedCourses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', related.position, 'relationKind', related.relation_kind,
        'sourceCourseCode', related.source_course_code,
        'sourceCourseTitle', related.source_course_title, 'sourceText', related.source_text
      ) order by related.position)
      from public.course_related_courses as related where related.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'courseOffering', (
      select jsonb_build_object('deliveryMode', offerings.delivery_mode, 'location', offerings.location)
      from public.course_offerings as offerings where offerings.snapshot_id = p_snapshot_id
    ),
    'offeringSessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', sessions.position, 'calendarYear', snapshot.academic_year,
        'academicPeriodCode', sessions.academic_period_code,
        'academicPeriodName', sessions.academic_period_name,
        'classNumber', sessions.class_number, 'startsOn', sessions.starts_on,
        'enrolClosesOn', sessions.enrol_closes_on, 'censusOn', sessions.census_on,
        'endsOn', sessions.ends_on, 'deliveryMode', sessions.delivery_mode,
        'location', sessions.location, 'classSummaryUrl', sessions.class_summary_url,
        'sourceText', sessions.source_text
      ) order by sessions.position)
      from public.offering_sessions as sessions where sessions.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'learningOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object('position', outcomes.position, 'body', outcomes.body)
        order by outcomes.position)
      from public.course_learning_outcomes as outcomes where outcomes.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'assessmentItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', items.position, 'title', items.title, 'weight', items.weight,
        'hurdle', items.hurdle, 'dueText', items.due_text, 'sourceText', items.source_text
      ) order by items.position)
      from public.course_assessment_items as items where items.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'assessmentOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assessmentPosition', items.position, 'learningOutcomePosition', outcomes.position
      ) order by items.position, outcomes.position)
      from public.course_assessment_outcomes as links
      join public.course_assessment_items as items on items.id = links.assessment_item_id
      join public.course_learning_outcomes as outcomes on outcomes.id = links.learning_outcome_id
      where links.snapshot_id = p_snapshot_id
    ), '[]'::jsonb),
    'sourcePageId', snapshot.source_page_id,
    'sourceUpdatedAt', snapshot.source_updated_at,
    'createdAt', snapshot.created_at,
    'sealedAt', snapshot.sealed_at
  ) || private.requirement_projection(p_snapshot_id)
  from selected_snapshot as snapshot;
$function$;

-- Course-code edges for published prerequisite rules of one academic year.
create or replace function public.published_requirement_graph(
  p_course_code text,
  p_academic_year smallint
)
returns table (
  from_code text,
  to_code text,
  from_is_available boolean,
  to_is_available boolean
)
language sql
stable
set search_path = ''
as $function$
  with recursive
  published_snapshots as (
    select item_years.item_id, item_years.published_snapshot_id as snapshot_id
    from public.catalogue_item_years as item_years
    join public.academic_years
      on academic_years.id = item_years.academic_year_id
     and academic_years.year = p_academic_year
    where item_years.kind = 'course'
      and item_years.archived_at is null
      and item_years.published_snapshot_id is not null
  ),
  root as (
    select published_snapshots.item_id
    from published_snapshots
    join public.catalogue_items as items on items.id = published_snapshots.item_id
    where items.code = upper(btrim(p_course_code))
    limit 1
  ),
  edges as (
    select item_references.item_id as from_item_id, published_snapshots.item_id as to_item_id
    from public.requirement_item_references as item_references
    join public.requirement_rules as rules on rules.id = item_references.rule_id
    join published_snapshots on published_snapshots.snapshot_id = rules.snapshot_id
    where rules.rule_kind = 'prerequisite'
    union
    select conditions.item_id, published_snapshots.item_id
    from public.requirement_conditions as conditions
    join public.requirement_rules as rules on rules.id = conditions.rule_id
    join published_snapshots on published_snapshots.snapshot_id = rules.snapshot_id
    where rules.rule_kind = 'prerequisite'
      and conditions.condition_kind = 'course'
      and conditions.item_id is not null
    union
    select options.item_id, published_snapshots.item_id
    from public.requirement_condition_options as options
    join public.requirement_conditions as conditions on conditions.id = options.condition_id
    join public.requirement_rules as rules on rules.id = conditions.rule_id
    join published_snapshots on published_snapshots.snapshot_id = rules.snapshot_id
    where rules.rule_kind = 'prerequisite'
      and options.kind = 'course'
      and options.item_id is not null
  ),
  upstream as (
    select edges.from_item_id, edges.to_item_id from edges
    join root on root.item_id = edges.to_item_id
    union
    select edges.from_item_id, edges.to_item_id from edges
    join upstream on upstream.from_item_id = edges.to_item_id
  ),
  graph_edges as (
    select upstream.from_item_id, upstream.to_item_id from upstream
    union
    select edges.from_item_id, edges.to_item_id from edges
    join root on root.item_id = edges.from_item_id
  )
  select
    source_items.code as from_code,
    target_items.code as to_code,
    source_availability.item_id is not null as from_is_available,
    target_availability.item_id is not null as to_is_available
  from graph_edges
  join public.catalogue_items as source_items on source_items.id = graph_edges.from_item_id
  join public.catalogue_items as target_items on target_items.id = graph_edges.to_item_id
  left join published_snapshots as source_availability
    on source_availability.item_id = graph_edges.from_item_id
  left join published_snapshots as target_availability
    on target_availability.item_id = graph_edges.to_item_id
  order by source_items.code, target_items.code;
$function$;

revoke all on function public.published_requirement_graph(text, smallint) from public;
grant execute on function public.published_requirement_graph(text, smallint) to anon, authenticated;

create or replace function public.published_course_detail(
  p_course_code text,
  p_academic_year smallint
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with selected as (
    select
      item_years.published_snapshot_id as snapshot_id,
      items.code as course_code,
      academic_years.year as academic_year
    from public.catalogue_items as items
    join public.catalogue_item_years as item_years
      on item_years.item_id = items.id
     and item_years.archived_at is null
    join public.academic_years
      on academic_years.id = item_years.academic_year_id
     and academic_years.year = p_academic_year
    where items.kind = 'course'
      and items.code = upper(btrim(p_course_code))
      and item_years.published_snapshot_id is not null
    limit 1
  )
  select private.course_snapshot_projection(selected.snapshot_id)
    || jsonb_build_object(
      'code', selected.course_code,
      'snapshotId', selected.snapshot_id,
      'prerequisiteEdges', coalesce((
        select jsonb_agg(jsonb_build_object(
          'from', graph.from_code, 'to', graph.to_code,
          'fromIsAvailable', graph.from_is_available, 'toIsAvailable', graph.to_is_available
        ) order by graph.from_code, graph.to_code)
        from public.published_requirement_graph(selected.course_code, selected.academic_year) as graph
      ), '[]'::jsonb)
    )
  from selected;
$function$;

-- Programme option checks now read the shared model.
create or replace function private.programme_offers_structure(
  p_programme_snapshot_id bigint,
  p_structure_kind text,
  p_structure_code text
)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.academic_structure_snapshot_relationships as relationships
    where relationships.snapshot_id = p_programme_snapshot_id
      and relationships.relationship_kind in ('required', 'option')
      and relationships.target_kind = p_structure_kind
      and relationships.target_code = p_structure_code
  ) or exists (
    select 1
    from public.requirement_condition_options as options
    join public.requirement_conditions as conditions on conditions.id = options.condition_id
    where options.snapshot_id = p_programme_snapshot_id
      and conditions.condition_kind = 'structure_set'
      and options.kind = p_structure_kind
      and options.code = p_structure_code
  ) or exists (
    select 1
    from public.requirement_conditions as conditions
    join public.catalogue_items as items on items.id = conditions.item_id
    where conditions.snapshot_id = p_programme_snapshot_id
      and conditions.condition_kind = 'structure'
      and items.kind = p_structure_kind
      and items.code = p_structure_code
  );
$function$;

revoke all on function private.programme_offers_structure(bigint, text, text)
from public, anon;
grant execute on function private.programme_offers_structure(bigint, text, text) to authenticated;

create or replace function public.save_current_user_primary_plan(
  p_display_name text,
  p_student_number text,
  p_academic_year smallint,
  p_commencement_year smallint,
  p_study_load text,
  p_programme_code text,
  p_major_code text default null,
  p_minor_codes text[] default '{}'::text[],
  p_specialisation_codes text[] default '{}'::text[]
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  user_id uuid := auth.uid();
  selected_academic_year_id bigint;
  selected_plan_id uuid;
  existing_plan_id uuid;
  selected_programme_year_id bigint;
  selected_programme_snapshot_id bigint;
  selected_programme_units numeric;
  selected_programme_duration_years numeric;
  selected_structure record;
  selected_structure_year_id bigint;
  inserted_structure_count integer;
  expected_structure_count integer;
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if nullif(btrim(p_display_name), '') is null then
    raise exception using errcode = '22023', message = 'Display name is required.';
  end if;

  p_major_code := nullif(upper(btrim(p_major_code)), '');
  p_minor_codes := coalesce(p_minor_codes, '{}'::text[]);
  p_specialisation_codes := coalesce(p_specialisation_codes, '{}'::text[]);

  if exists (
    select 1
    from unnest(p_minor_codes || p_specialisation_codes) as requested(code)
    where nullif(btrim(requested.code), '') is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'Selected minor and specialisation codes cannot be blank.';
  end if;

  select coalesce(array_agg(upper(btrim(requested.code)) order by requested.position), '{}'::text[])
  into p_minor_codes
  from unnest(p_minor_codes) with ordinality as requested(code, position);

  select coalesce(array_agg(upper(btrim(requested.code)) order by requested.position), '{}'::text[])
  into p_specialisation_codes
  from unnest(p_specialisation_codes) with ordinality as requested(code, position);

  if exists (
    select 1
    from (
      select p_major_code as code where p_major_code is not null
      union all
      select code from unnest(p_minor_codes) as minors(code)
      union all
      select code from unnest(p_specialisation_codes) as specialisations(code)
    ) as requested
    group by requested.code
    having count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'Select each academic structure only once.';
  end if;

  select years.id
  into selected_academic_year_id
  from public.academic_years as years
  where years.year = p_academic_year;
  if selected_academic_year_id is null then
    raise exception using errcode = 'P0002', message = 'The selected academic year is not available.';
  end if;

  select
    item_years.id,
    item_years.published_snapshot_id,
    details.units,
    details.duration_years
  into
    selected_programme_year_id,
    selected_programme_snapshot_id,
    selected_programme_units,
    selected_programme_duration_years
  from public.catalogue_item_years as item_years
  join public.catalogue_items as items on items.id = item_years.item_id
  join public.structure_snapshot_details as details
    on details.snapshot_id = item_years.published_snapshot_id
  where items.code = upper(btrim(p_programme_code))
    and items.kind = 'programme'
    and item_years.academic_year_id = selected_academic_year_id
    and item_years.archived_at is null
    and item_years.published_snapshot_id is not null
  limit 1;
  if selected_programme_year_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The selected programme is not published for that academic year.';
  end if;
  if selected_programme_units is null
     and selected_programme_duration_years is null then
    raise exception using
      errcode = '22023',
      message = 'The selected programme does not include duration or unit information for planning.';
  end if;

  for selected_structure in
    select 'major'::text as role, p_major_code as code, 1::integer as position
    where p_major_code is not null
    union all
    select
      'minor'::text,
      requested.code,
      requested.position::integer + case when p_major_code is null then 0 else 1 end
    from unnest(p_minor_codes) with ordinality as requested(code, position)
    union all
    select
      'specialisation'::text,
      requested.code,
      requested.position::integer
        + case when p_major_code is null then 0 else 1 end
        + cardinality(p_minor_codes)
    from unnest(p_specialisation_codes) with ordinality as requested(code, position)
    order by position
  loop
    selected_structure_year_id := null;

    select item_years.id
    into selected_structure_year_id
    from public.catalogue_item_years as item_years
    join public.catalogue_items as items on items.id = item_years.item_id
    where items.code = selected_structure.code
      and items.kind = selected_structure.role
      and item_years.academic_year_id = selected_academic_year_id
      and item_years.archived_at is null
      and item_years.published_snapshot_id is not null
    limit 1;

    if selected_structure_year_id is null then
      raise exception using
        errcode = 'P0002',
        message = format(
          'The selected %s is not published for that academic year.',
          selected_structure.role
        );
    end if;

    if not private.programme_offers_structure(
      selected_programme_snapshot_id,
      selected_structure.role,
      selected_structure.code
    ) then
      raise exception using
        errcode = '22023',
        message = format(
          'The selected %s is not an explicit option for that programme.',
          selected_structure.role
        );
    end if;
  end loop;

  update public.profiles
  set
    display_name = btrim(p_display_name),
    student_number = nullif(lower(btrim(p_student_number)), '')
  where id = user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The authenticated profile is missing.';
  end if;

  select plans.id
  into existing_plan_id
  from public.plans
  where plans.owner_id = user_id and plans.is_primary
  for update;

  if existing_plan_id is not null then
    delete from public.plan_structures
    where plan_id = existing_plan_id and owner_id = user_id;
  end if;

  insert into public.plans (
    owner_id,
    academic_year_id,
    name,
    is_primary,
    status,
    commencement_year,
    study_load
  ) values (
    user_id,
    selected_academic_year_id,
    upper(btrim(p_programme_code)) || ' plan',
    true,
    'active',
    p_commencement_year,
    p_study_load
  )
  on conflict (owner_id) where is_primary do update
  set
    academic_year_id = excluded.academic_year_id,
    name = excluded.name,
    status = 'active',
    commencement_year = excluded.commencement_year,
    study_load = excluded.study_load,
    updated_at = now()
  returning id into selected_plan_id;

  insert into public.plan_structures (
    plan_id, owner_id, academic_year_id, structure_year_id, role, position
  ) values (
    selected_plan_id, user_id, selected_academic_year_id, selected_programme_year_id, 'programme', 0
  );

  insert into public.plan_structures (
    plan_id, owner_id, academic_year_id, structure_year_id, role, position
  )
  select
    selected_plan_id,
    user_id,
    selected_academic_year_id,
    item_years.id,
    requested.role,
    requested.position
  from (
    select 'major'::text as role, p_major_code as code, 1::integer as position
    where p_major_code is not null
    union all
    select
      'minor'::text,
      minors.code,
      minors.position::integer + case when p_major_code is null then 0 else 1 end
    from unnest(p_minor_codes) with ordinality as minors(code, position)
    union all
    select
      'specialisation'::text,
      specialisations.code,
      specialisations.position::integer
        + case when p_major_code is null then 0 else 1 end
        + cardinality(p_minor_codes)
    from unnest(p_specialisation_codes) with ordinality as specialisations(code, position)
  ) as requested
  join public.catalogue_items as items
    on items.code = requested.code
   and items.kind = requested.role
  join public.catalogue_item_years as item_years
    on item_years.item_id = items.id
   and item_years.academic_year_id = selected_academic_year_id
   and item_years.archived_at is null
   and item_years.published_snapshot_id is not null
  order by requested.position;

  get diagnostics inserted_structure_count = row_count;
  expected_structure_count :=
    case when p_major_code is null then 0 else 1 end
    + cardinality(p_minor_codes)
    + cardinality(p_specialisation_codes);

  if inserted_structure_count <> expected_structure_count then
    raise exception using
      errcode = '40001',
      message = 'A selected academic structure changed while the plan was being saved. Please try again.';
  end if;

  return selected_plan_id;
end;
$function$;

revoke all on function public.save_current_user_primary_plan(
  text, text, smallint, smallint, text, text, text, text[], text[]
) from public, anon;

commit;
