begin;

-- Courses, programmes, majors, minors and specialisations share one identity,
-- year and snapshot model. catalogue_codes replaces courses and
-- academic_structures, catalogue_records replaces course_years and
-- academic_structure_years, and catalogue_versions replaces course_snapshots
-- and academic_structure_snapshots. Kind-specific scalar content moves to
-- course_version_details and structure_version_details; the existing child
-- tables are re-pointed at the shared snapshot. This is a development cutover:
-- every catalogue, plan and attempt row is cleared and the preview seed
-- repopulates the local database.

truncate table
  public.plan_items,
  public.plan_structures,
  public.plans,
  public.course_attempts,
  public.approval_events,
  public.approval_requests,
  public.course_offerings,
  public.offering_sessions,
  public.course_learning_outcomes,
  public.course_assessment_items,
  public.course_assessment_outcomes,
  public.course_fees,
  public.course_attributes,
  public.course_unit_options,
  public.course_areas_of_interest,
  public.course_related_courses,
  public.course_snapshot_field_evidence,
  public.course_rules,
  public.course_rule_groups,
  public.course_rule_conditions,
  public.course_rule_condition_courses,
  public.course_rule_course_references,
  public.course_snapshots,
  public.course_years,
  public.courses,
  public.course_source_pages,
  public.course_sources,
  public.academic_structure_snapshot_sections,
  public.academic_structure_summary_fields,
  public.academic_structure_learning_outcomes,
  public.academic_structure_fees,
  public.academic_structure_snapshot_relationships,
  public.academic_structure_requirement_groups,
  public.academic_structure_requirement_conditions,
  public.academic_structure_requirement_options,
  public.academic_structure_unmodelled_requirements,
  public.academic_structure_snapshot_evidence,
  public.academic_structure_snapshots,
  public.academic_structure_years,
  public.academic_structures,
  public.academic_structure_source_pages,
  public.academic_structure_sources
cascade;

-- Policies on the child tables reference the replaced tables and helpers, so
-- they go first. Uniform replacements are created once the shared model exists.
do $$
declare
  child text;
  existing record;
begin
  foreach child in array array[
    'course_offerings',
    'offering_sessions',
    'course_learning_outcomes',
    'course_assessment_items',
    'course_assessment_outcomes',
    'course_fees',
    'course_attributes',
    'course_unit_options',
    'course_areas_of_interest',
    'course_related_courses',
    'course_rules',
    'course_rule_groups',
    'course_rule_conditions',
    'course_rule_condition_courses',
    'course_rule_course_references',
    'course_snapshot_field_evidence',
    'academic_structure_snapshot_sections',
    'academic_structure_summary_fields',
    'academic_structure_learning_outcomes',
    'academic_structure_fees',
    'academic_structure_snapshot_relationships',
    'academic_structure_requirement_groups',
    'academic_structure_requirement_conditions',
    'academic_structure_requirement_options',
    'academic_structure_unmodelled_requirements',
    'academic_structure_snapshot_evidence'
  ] loop
    for existing in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = child
    loop
      execute format('drop policy %I on public.%I', existing.policyname, child);
    end loop;
  end loop;
end;
$$;

-- Functions and triggers bound to the replaced tables ----------------------------

drop function public.published_course_detail(text, smallint);
drop function public.published_course_availability(text, smallint);
drop function public.published_course_requisite_graph(text, smallint);
drop function public.current_user_course_attempt_snapshot_projections(bigint[]);
drop function private.course_snapshot_projection(bigint);
drop function public.add_current_user_plan_item(text, smallint, smallint, text);
drop function public.record_current_user_course_attempt(uuid, text, numeric, numeric);
drop function public.save_current_user_academic_result(uuid, text, numeric, text, numeric);
drop function public.save_current_user_primary_plan(text, text, smallint, smallint, text, text, text, text[], text[]);

drop trigger course_attempts_enforce_snapshot_lineage on public.course_attempts;
drop function private.enforce_course_attempt_snapshot_lineage();
drop trigger plan_items_require_active_course_year on public.plan_items;
drop function private.require_active_plan_item_course_year();
drop trigger plan_structures_validate_kind on public.plan_structures;
drop function private.validate_plan_structure_kind();

do $$
declare
  child record;
begin
  -- Child-table triggers that looked up course_snapshots, course_years or
  -- academic_structure_snapshots. The shared guard below replaces them.
  for child in
    select t.tgrelid::regclass as relation, t.tgname
    from pg_trigger as t
    join pg_proc as p on p.oid = t.tgfoid
    join pg_namespace as n on n.oid = p.pronamespace
    where not t.tgisinternal
      and n.nspname = 'private'
      and p.proname in (
        'guard_snapshot_rich_child_mutation',
        'reject_sealed_course_snapshot_child_insert',
        'reject_immutable_course_record_mutation',
        'reject_academic_structure_snapshot_mutation',
        'guard_academic_structure_snapshot_child_insert',
        'enforce_course_snapshot_immutability',
        'seal_course_year_snapshot_pointers',
        'guard_archived_course_year',
        'validate_academic_structure_year_snapshot_pointers'
      )
  loop
    execute format('drop trigger %I on %s', child.tgname, child.relation);
  end loop;
end;
$$;

drop function private.guard_snapshot_rich_child_mutation();
drop function private.reject_sealed_course_snapshot_child_insert();
drop function private.reject_immutable_course_record_mutation();
drop function private.reject_academic_structure_snapshot_mutation();
drop function private.guard_academic_structure_snapshot_child_insert();
drop function private.enforce_course_snapshot_immutability();
drop function private.seal_course_year_snapshot_pointers();
drop function private.guard_archived_course_year();
drop function private.validate_academic_structure_year_snapshot_pointers();

-- Shared code, annual record and immutable version tables -------------------------

create table public.catalogue_codes (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  kind text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogue_codes_public_id_unique unique (public_id),
  constraint catalogue_codes_kind_code_unique unique (kind, code),
  constraint catalogue_codes_id_kind_unique unique (id, kind),
  constraint catalogue_codes_kind_check check (
    kind in ('course', 'programme', 'major', 'minor', 'specialisation')
  ),
  constraint catalogue_codes_code_format_check check (
    case kind
      when 'course' then code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'
      else code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'
    end
  )
);

create index catalogue_codes_code_idx on public.catalogue_codes (code);

-- One row per code and academic year. published_version_id is the efficient
-- pointer to the version students currently read. Working drafts are a separate
-- mutable domain and do not belong on this core record.
create table public.catalogue_records (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  code_id bigint not null,
  kind text not null,
  academic_year_id bigint not null,
  published_version_id bigint,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogue_records_public_id_unique unique (public_id),
  constraint catalogue_records_code_year_unique unique (code_id, academic_year_id),
  constraint catalogue_records_id_year_unique unique (id, academic_year_id),
  constraint catalogue_records_id_kind_unique unique (id, kind),
  constraint catalogue_records_code_kind_fkey
    foreign key (code_id, kind) references public.catalogue_codes (id, kind)
    on delete cascade,
  constraint catalogue_records_academic_year_id_fkey
    foreign key (academic_year_id) references public.academic_years (id)
);

create index catalogue_records_academic_year_idx
  on public.catalogue_records (academic_year_id, kind);

create index catalogue_records_published_idx
  on public.catalogue_records (published_version_id)
  where published_version_id is not null;

alter table public.catalogue_source_pages
  add constraint catalogue_source_pages_id_year_unique unique (id, academic_year_id);

-- A version is assembled inside one transaction, then sealed before that
-- transaction completes. Once sealed, neither it nor its normalised content
-- can be changed.
create table public.catalogue_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  record_id bigint not null,
  kind text not null,
  academic_year_id bigint not null,
  origin text not null,
  based_on_version_id bigint,
  source_page_id bigint,
  content_hash text not null,
  sealed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint catalogue_versions_public_id_unique unique (public_id),
  constraint catalogue_versions_id_item_year_unique unique (id, record_id),
  constraint catalogue_versions_id_year_unique unique (id, academic_year_id),
  constraint catalogue_versions_id_kind_unique unique (id, kind),
  constraint catalogue_versions_item_year_fkey
    foreign key (record_id, academic_year_id)
    references public.catalogue_records (id, academic_year_id)
    on delete cascade,
  constraint catalogue_versions_item_year_kind_fkey
    foreign key (record_id, kind)
    references public.catalogue_records (id, kind)
    on delete cascade,
  constraint catalogue_versions_based_on_fkey
    foreign key (based_on_version_id, record_id)
    references public.catalogue_versions (id, record_id),
  constraint catalogue_versions_source_page_fkey
    foreign key (source_page_id, academic_year_id)
    references public.catalogue_source_pages (id, academic_year_id),
  constraint catalogue_versions_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint catalogue_versions_origin_check check (origin in ('import', 'manual')),
  constraint catalogue_versions_content_hash_check check (
    content_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint catalogue_versions_sealed_at_check check (
    sealed_at is null or sealed_at >= created_at
  )
);

create index catalogue_versions_record_idx
  on public.catalogue_versions (record_id, created_at desc);

alter table public.catalogue_records
  add constraint catalogue_records_published_version_fkey
    foreign key (published_version_id, id)
    references public.catalogue_versions (id, record_id);

-- Each row is one exact interval during which a version was student-visible.
create table public.catalogue_publications (
  id bigint generated always as identity primary key,
  record_id bigint not null,
  version_id bigint not null,
  published_by uuid,
  published_at timestamptz not null default statement_timestamp(),
  unpublished_by uuid,
  unpublished_at timestamptz,
  constraint catalogue_publications_record_id_fkey
    foreign key (record_id) references public.catalogue_records (id)
    on delete cascade,
  constraint catalogue_publications_version_record_fkey
    foreign key (version_id, record_id)
    references public.catalogue_versions (id, record_id),
  constraint catalogue_publications_published_by_fkey
    foreign key (published_by) references auth.users (id) on delete set null,
  constraint catalogue_publications_unpublished_by_fkey
    foreign key (unpublished_by) references auth.users (id) on delete set null,
  constraint catalogue_publications_interval_check check (
    unpublished_at is null or unpublished_at >= published_at
  )
);

create index catalogue_publications_record_idx
  on public.catalogue_publications (record_id, published_at desc);

create unique index catalogue_publications_one_current_idx
  on public.catalogue_publications (record_id)
  where unpublished_at is null;

-- Kind-specific scalar content ----------------------------------------------------

create table public.course_version_details (
  version_id bigint primary key,
  kind text not null default 'course',
  title text not null,
  unit_value_kind text not null default 'fixed',
  units numeric(6, 2),
  minimum_units numeric(6, 2),
  maximum_units numeric(6, 2),
  eftsl numeric(7, 5),
  level smallint not null,
  subject_code text not null,
  subject_name text,
  school text,
  college text,
  academic_career text,
  convener_text text,
  delivery_summary text,
  introduction text,
  description text,
  workload_text text,
  workload_hours numeric(7, 2),
  inherent_requirements text,
  prescribed_texts text,
  offering_status text not null default 'unknown',
  source_updated_at timestamptz,
  constraint course_version_details_snapshot_kind_fkey
    foreign key (version_id, kind) references public.catalogue_versions (id, kind)
    on delete cascade,
  constraint course_version_details_kind_check check (kind = 'course'),
  constraint course_version_details_title_not_blank_check check (btrim(title) <> ''),
  constraint course_version_details_unit_value_kind_check check (
    unit_value_kind in ('fixed', 'range', 'variable', 'unknown')
  ),
  constraint course_version_details_units_check check (
    (units is null or units >= 0)
    and (minimum_units is null or minimum_units >= 0)
    and (maximum_units is null or maximum_units >= 0)
    and (minimum_units is null or maximum_units is null or maximum_units >= minimum_units)
    and (unit_value_kind <> 'fixed' or units is not null)
  ),
  constraint course_version_details_eftsl_check check (eftsl is null or eftsl >= 0),
  constraint course_version_details_level_check check (level between 0 and 9999),
  constraint course_version_details_subject_code_check check (subject_code ~ '^[A-Z]{4}$'),
  constraint course_version_details_academic_career_check check (
    academic_career is null or academic_career in ('UGRD', 'PGRD', 'RSCH', 'OTHER')
  ),
  constraint course_version_details_workload_hours_check check (
    workload_hours is null or workload_hours >= 0
  ),
  constraint course_version_details_offering_status_check check (
    offering_status in ('offered', 'not_offered', 'unknown')
  )
);

create table public.structure_version_details (
  version_id bigint primary key,
  kind text not null,
  name text not null,
  acronym text,
  short_name text,
  introduction text,
  description text,
  units numeric(7, 2),
  duration_years numeric(4, 1),
  academic_career text,
  college text,
  mode_of_delivery text,
  selection_rank numeric(5, 2),
  atar numeric(5, 2),
  can_combine boolean,
  can_combine_vertical boolean,
  study_as text,
  contact_text text,
  constraint structure_version_details_snapshot_kind_fkey
    foreign key (version_id, kind) references public.catalogue_versions (id, kind)
    on delete cascade,
  constraint structure_version_details_kind_check check (
    kind in ('programme', 'major', 'minor', 'specialisation')
  ),
  constraint structure_version_details_name_check check (btrim(name) <> ''),
  constraint structure_version_details_units_check check (units is null or units > 0),
  constraint structure_version_details_duration_check check (
    duration_years is null or duration_years > 0
  )
);

-- Shared evidence replaces the two kind-specific evidence tables.
drop table public.course_snapshot_field_evidence;
drop table public.academic_structure_snapshot_evidence;

create table public.catalogue_version_provenance (
  id bigint generated always as identity primary key,
  version_id bigint not null,
  academic_year_id bigint not null,
  source_page_id bigint,
  field_path text not null,
  method text not null,
  confidence numeric(5, 4),
  source_locator text,
  source_excerpt text,
  created_at timestamptz not null default now(),
  constraint catalogue_version_provenance_snapshot_fkey
    foreign key (version_id, academic_year_id)
    references public.catalogue_versions (id, academic_year_id)
    on delete cascade,
  constraint catalogue_version_provenance_source_page_fkey
    foreign key (source_page_id, academic_year_id)
    references public.catalogue_source_pages (id, academic_year_id),
  constraint catalogue_version_provenance_field_path_check check (btrim(field_path) <> ''),
  constraint catalogue_version_provenance_method_check check (
    method in ('deterministic', 'model', 'manual')
  ),
  constraint catalogue_version_provenance_confidence_check check (
    confidence is null or confidence between 0 and 1
  )
);

create index catalogue_version_provenance_snapshot_idx
  on public.catalogue_version_provenance (version_id, field_path);

-- Re-point the existing child tables -----------------------------------------------

do $$
declare
  dependent record;
  child text;
  course_children constant text[] := array[
    'course_offerings',
    'offering_sessions',
    'course_learning_outcomes',
    'course_assessment_items',
    'course_assessment_outcomes',
    'course_fees',
    'course_attributes',
    'course_unit_options',
    'course_areas_of_interest',
    'course_related_courses',
    'course_rules',
    'course_rule_groups',
    'course_rule_conditions',
    'course_rule_condition_courses',
    'course_rule_course_references'
  ];
  year_scoped_children constant text[] := array[
    'course_offerings',
    'offering_sessions',
    'course_rules'
  ];
  structure_children constant text[] := array[
    'academic_structure_snapshot_sections',
    'academic_structure_summary_fields',
    'academic_structure_learning_outcomes',
    'academic_structure_fees',
    'academic_structure_snapshot_relationships',
    'academic_structure_requirement_groups',
    'academic_structure_requirement_conditions',
    'academic_structure_requirement_options',
    'academic_structure_unmodelled_requirements'
  ];
begin
  -- Drop every foreign key into the replaced tables. The replacements follow.
  for dependent in
    select conrelid::regclass as relation, conname
    from pg_constraint
    where contype = 'f'
      and confrelid in (
        'public.courses'::regclass,
        'public.course_years'::regclass,
        'public.course_snapshots'::regclass,
        'public.course_source_pages'::regclass,
        'public.academic_structures'::regclass,
        'public.academic_structure_years'::regclass,
        'public.academic_structure_snapshots'::regclass,
        'public.academic_structure_source_pages'::regclass
      )
      and conrelid not in (
        'public.courses'::regclass,
        'public.course_years'::regclass,
        'public.course_snapshots'::regclass,
        'public.course_source_pages'::regclass,
        'public.academic_structures'::regclass,
        'public.academic_structure_years'::regclass,
        'public.academic_structure_snapshots'::regclass,
        'public.academic_structure_source_pages'::regclass
      )
  loop
    execute format(
      'alter table %s drop constraint %I',
      dependent.relation,
      dependent.conname
    );
  end loop;

  foreach child in array course_children loop
    execute format(
      'alter table public.%I rename column course_snapshot_id to version_id',
      child
    );
    execute format(
      'alter table public.%I add constraint %I foreign key (version_id) '
      'references public.catalogue_versions (id) on delete cascade',
      child,
      child || '_snapshot_id_fkey'
    );
  end loop;

  foreach child in array year_scoped_children loop
    execute format(
      'alter table public.%I rename column course_source_page_id to source_page_id',
      child
    );
    execute format(
      'alter table public.%I '
      'add constraint %I foreign key (version_id, academic_year_id) '
      'references public.catalogue_versions (id, academic_year_id) on delete cascade, '
      'add constraint %I foreign key (source_page_id, academic_year_id) '
      'references public.catalogue_source_pages (id, academic_year_id)',
      child,
      child || '_snapshot_year_fkey',
      child || '_source_page_year_fkey'
    );
  end loop;

  foreach child in array structure_children loop
    execute format(
      'alter table public.%I rename column snapshot_id to version_id',
      child
    );
    execute format(
      'alter table public.%I add constraint %I foreign key (version_id) '
      'references public.catalogue_versions (id) on delete cascade',
      child,
      child || '_snapshot_id_fkey'
    );
  end loop;
end;
$$;

-- Manual snapshots have no source page, so page provenance on the year-scoped
-- children is optional.
alter table public.course_offerings alter column source_page_id drop not null;
alter table public.offering_sessions alter column source_page_id drop not null;
alter table public.course_rules alter column source_page_id drop not null;

alter table public.course_related_courses
  add constraint course_related_courses_related_item_fkey
    foreign key (related_course_id) references public.catalogue_codes (id);

alter table public.course_rule_conditions
  add constraint course_rule_conditions_required_course_fkey
    foreign key (required_course_id) references public.catalogue_codes (id),
  add constraint course_rule_conditions_required_structure_fkey
    foreign key (required_structure_id) references public.catalogue_codes (id);

alter table public.course_rule_condition_courses
  add constraint course_rule_condition_courses_referenced_item_fkey
    foreign key (referenced_course_id) references public.catalogue_codes (id);

alter table public.course_rule_course_references
  add constraint course_rule_course_references_referenced_item_fkey
    foreign key (referenced_course_id) references public.catalogue_codes (id);

create or replace function private.validate_course_rule_condition_course()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.course_rule_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.version_id = new.version_id
      and conditions.condition_kind = 'course_set_units'
  ) then
    raise exception 'course-set members require a course_set_units condition'
      using errcode = '23503';
  end if;

  if new.referenced_course_id is not null
    and not exists (
      select 1
      from public.catalogue_codes
      where id = new.referenced_course_id
        and kind = 'course'
        and code = new.source_course_code
    )
  then
    raise exception 'referenced course does not match its source code'
      using errcode = '23503';
  end if;

  return new;
end;
$function$;

-- User-owned tables ----------------------------------------------------------------

alter table public.plan_items
  rename column course_id to catalogue_record_id;

alter table public.plan_items
  drop column academic_year_id,
  add constraint plan_items_catalogue_record_fkey
    foreign key (catalogue_record_id) references public.catalogue_records (id);

alter table public.course_attempts
  rename column course_snapshot_id to catalogue_version_id;

alter table public.course_attempts
  add constraint course_attempts_catalogue_version_fkey
    foreign key (catalogue_version_id) references public.catalogue_versions (id);

alter table public.plan_structures
  rename column structure_year_id to catalogue_record_id;

alter table public.plan_structures
  drop column academic_year_id,
  add constraint plan_structures_catalogue_record_fkey
    foreign key (catalogue_record_id) references public.catalogue_records (id);

-- The replaced tables reference each other circularly, so they go as one group.
-- Every dependency outside the group was re-pointed above.
drop table
  public.course_snapshots,
  public.course_years,
  public.courses,
  public.course_source_pages,
  public.course_sources,
  public.academic_structure_snapshots,
  public.academic_structure_years,
  public.academic_structures,
  public.academic_structure_source_pages,
  public.academic_structure_sources;

alter table public.course_attempts
  drop column course_id,
  add constraint course_attempts_owner_version_period_unique
    unique (owner_id, catalogue_version_id, academic_period_id);

drop function private.can_read_academic_structure_snapshot(bigint);
drop function private.is_published_academic_structure_snapshot(bigint);

-- Integrity triggers -----------------------------------------------------------------

create trigger catalogue_codes_set_updated_at
before update on public.catalogue_codes
for each row execute function private.set_updated_at();

create trigger catalogue_records_set_updated_at
before update on public.catalogue_records
for each row execute function private.set_updated_at();

-- Only the one-way sealing update is allowed. Cascading record deletion may
-- still remove versions, but application code cannot mutate materialised state.
create or replace function private.enforce_catalogue_version_immutability()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and old.sealed_at is null
    and new.sealed_at is not null
    and (to_jsonb(new) - 'sealed_at') = (to_jsonb(old) - 'sealed_at')
  then
    return new;
  end if;
  raise exception
    'Catalogue versions are immutable; create a new version instead.'
    using errcode = '55000';
end;
$function$;

revoke all on function private.enforce_catalogue_version_immutability()
from public, anon, authenticated;

create trigger catalogue_versions_enforce_immutability
before update or delete on public.catalogue_versions
for each row execute function private.enforce_catalogue_version_immutability();

create or replace function private.seal_published_catalogue_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.catalogue_versions
  set sealed_at = greatest(statement_timestamp(), created_at)
  where id = new.published_version_id
    and sealed_at is null;
  return new;
end;
$function$;

revoke all on function private.seal_published_catalogue_version()
from public, anon, authenticated;

create trigger catalogue_records_seal_published_version
before insert or update of published_version_id
on public.catalogue_records
for each row execute function private.seal_published_catalogue_version();

-- Archived years keep their pointers and cannot be edited further.
create or replace function private.guard_archived_catalogue_item_year()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.archived_at is not null and new is distinct from old then
    raise exception 'Archived catalogue years are immutable.' using errcode = '55000';
  end if;
  if new.archived_at is not null
    and new.published_version_id is distinct from old.published_version_id
  then
    raise exception 'Archival cannot change the published version.' using errcode = '55000';
  end if;
  if new.archived_at is not null and exists (
    select 1
    from public.plan_items
    where plan_items.catalogue_record_id = old.id
  ) then
    raise exception
      'This catalogue year cannot be archived while it is referenced by a student plan.'
      using errcode = '55000';
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_archived_catalogue_item_year()
from public, anon, authenticated;

create trigger catalogue_records_zz_guard_archived
before update on public.catalogue_records
for each row execute function private.guard_archived_catalogue_item_year();

create or replace function private.record_catalogue_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and new.published_version_id is not distinct from old.published_version_id
  then
    return new;
  end if;

  update public.catalogue_publications
  set
    unpublished_by = (select auth.uid()),
    unpublished_at = statement_timestamp()
  where record_id = new.id
    and unpublished_at is null;

  if new.published_version_id is null then
    return new;
  end if;

  insert into public.catalogue_publications (record_id, version_id, published_by)
  values (new.id, new.published_version_id, (select auth.uid()));
  return new;
end;
$function$;

revoke all on function private.record_catalogue_publication()
from public, anon, authenticated;

create trigger catalogue_records_record_publication
after insert or update of published_version_id on public.catalogue_records
for each row execute function private.record_catalogue_publication();

-- Child rows are assembled before a snapshot becomes a pointer and frozen after.
-- Locking the item year serialises assembly against publication.
create or replace function private.guard_snapshot_child_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  target_snapshot_id bigint := case
    when tg_op = 'DELETE' then old.version_id
    else new.version_id
  end;
  snapshot_is_sealed boolean;
begin
  select snapshots.sealed_at is not null
  into snapshot_is_sealed
  from public.catalogue_versions as snapshots
  join public.catalogue_records as item_years
    on item_years.id = snapshots.record_id
  where snapshots.id = target_snapshot_id
  for update of item_years;

  if coalesce(snapshot_is_sealed, false) then
    raise exception
      'catalogue snapshot % is sealed; create a new snapshot instead',
      target_snapshot_id
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_snapshot_child_mutation()
from public, anon, authenticated;

do $$
declare
  child text;
begin
  foreach child in array array[
    'course_version_details',
    'structure_version_details',
    'catalogue_version_provenance',
    'course_offerings',
    'offering_sessions',
    'course_learning_outcomes',
    'course_assessment_items',
    'course_assessment_outcomes',
    'course_fees',
    'course_attributes',
    'course_unit_options',
    'course_areas_of_interest',
    'course_related_courses',
    'course_rules',
    'course_rule_groups',
    'course_rule_conditions',
    'course_rule_condition_courses',
    'course_rule_course_references',
    'academic_structure_snapshot_sections',
    'academic_structure_summary_fields',
    'academic_structure_learning_outcomes',
    'academic_structure_fees',
    'academic_structure_snapshot_relationships',
    'academic_structure_requirement_groups',
    'academic_structure_requirement_conditions',
    'academic_structure_requirement_options',
    'academic_structure_unmodelled_requirements'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I '
      'for each row execute function private.guard_snapshot_child_mutation()',
      child || '_guard_sealed',
      child
    );
  end loop;
end;
$$;

-- Plan items reference one active annual course record.
create or replace function private.require_active_plan_item_course_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  selected_archived_at timestamptz;
begin
  select item_years.archived_at
  into selected_archived_at
  from public.catalogue_records as item_years
  where item_years.id = new.catalogue_record_id
    and item_years.kind = 'course'
  for share of item_years;
  if not found then
    raise exception 'The selected course year was not found.'
      using errcode = 'P0002';
  end if;
  if selected_archived_at is not null then
    raise exception 'Plan items can reference only active course years.'
      using errcode = '55000';
  end if;
  return new;
end;
$function$;

revoke all on function private.require_active_plan_item_course_year()
from public, anon, authenticated;

create trigger plan_items_require_active_course_year
before insert or update of catalogue_record_id on public.plan_items
for each row execute function private.require_active_plan_item_course_year();

create or replace function private.enforce_course_attempt_snapshot_lineage()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  snapshot_academic_year smallint;
  period_calendar_year smallint;
begin
  select academic_years.year
  into snapshot_academic_year
  from public.catalogue_versions as snapshots
  join public.catalogue_records as item_years
    on item_years.id = snapshots.record_id
  join public.academic_years
    on academic_years.id = snapshots.academic_year_id
  where snapshots.id = new.catalogue_version_id
    and snapshots.kind = 'course'
    and item_years.id = snapshots.record_id;
  if snapshot_academic_year is null then
    raise exception
      'course attempt snapshot does not belong to the selected course'
      using errcode = '23503';
  end if;
  select academic_periods.calendar_year
  into period_calendar_year
  from public.academic_periods
  where academic_periods.id = new.academic_period_id;
  if period_calendar_year is not null
    and period_calendar_year <> snapshot_academic_year
  then
    raise exception
      'course attempt period year does not match the snapshot academic year'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_course_attempt_snapshot_lineage()
from public, anon, authenticated;

create trigger course_attempts_enforce_snapshot_lineage
before insert or update of catalogue_version_id, academic_period_id
on public.course_attempts
for each row execute function private.enforce_course_attempt_snapshot_lineage();

create or replace function private.validate_plan_structure_kind()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  selected_kind text;
begin
  select item_years.kind
  into selected_kind
  from public.catalogue_records as item_years
  where item_years.id = new.catalogue_record_id;
  if selected_kind is not null and selected_kind is distinct from new.role then
    raise exception using
      errcode = '23514',
      message = 'The plan structure role must match the academic structure kind.';
  end if;
  return new;
end;
$function$;

revoke all on function private.validate_plan_structure_kind()
from public, anon, authenticated;

create trigger plan_structures_validate_kind
before insert or update of catalogue_record_id, role on public.plan_structures
for each row execute function private.validate_plan_structure_kind();

-- Access -------------------------------------------------------------------------------

create or replace function private.is_published_version(p_version_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.catalogue_records as item_years
    where item_years.published_version_id = p_version_id
      and item_years.archived_at is null
  );
$function$;

create or replace function private.can_manage_catalogue()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_permission('catalogue.read')
    or private.has_permission('catalogue.write')
    or private.has_permission('courses.read_drafts')
    or private.has_permission('courses.write')
    or private.has_permission('imports.manage');
$function$;

-- Published snapshots are public. Administrators read drafts, and students
-- keep reading the snapshot their recorded attempts point at.
create or replace function private.can_read_version(p_version_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_published_version(p_version_id)
    or private.can_manage_catalogue()
    or exists (
      select 1
      from public.course_attempts as attempts
      where attempts.catalogue_version_id = p_version_id
        and attempts.owner_id = (select auth.uid())
    );
$function$;

-- Identities are visible when any year is published, when a published rule
-- references them as a placeholder, or when the reader's own plan or history
-- uses them.
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
      from public.catalogue_records as item_years
      where item_years.code_id = p_item_id
        and item_years.published_version_id is not null
        and item_years.archived_at is null
    )
    or exists (
      select 1
      from public.course_rule_conditions as conditions
      where (conditions.required_course_id = p_item_id
        or conditions.required_structure_id = p_item_id)
        and private.is_published_version(conditions.version_id)
    )
    or exists (
      select 1
      from public.course_rule_course_references as rule_references
      where rule_references.referenced_course_id = p_item_id
        and private.is_published_version(rule_references.version_id)
    )
    or exists (
      select 1
      from public.course_rule_condition_courses as members
      where members.referenced_course_id = p_item_id
        and private.is_published_version(members.version_id)
    )
    or exists (
      select 1
      from public.course_related_courses as related
      where related.related_course_id = p_item_id
        and private.is_published_version(related.version_id)
    )
    or exists (
      select 1
      from public.course_attempts as attempts
      join public.catalogue_versions as versions
        on versions.id = attempts.catalogue_version_id
      join public.catalogue_records as records on records.id = versions.record_id
      where records.code_id = p_item_id
        and attempts.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.plan_items
      join public.catalogue_records as records
        on records.id = plan_items.catalogue_record_id
      where records.code_id = p_item_id
        and plan_items.owner_id = (select auth.uid())
    );
$function$;

-- Policies evaluate these with the querying role's privileges, so the roles
-- the policies apply to must be able to execute them.
revoke all on function private.is_published_version(bigint) from public;
revoke all on function private.can_manage_catalogue() from public;
revoke all on function private.can_read_version(bigint) from public;
revoke all on function private.can_read_catalogue_item(bigint) from public;
grant execute on function private.is_published_version(bigint) to anon, authenticated;
grant execute on function private.can_manage_catalogue() to anon, authenticated;
grant execute on function private.can_read_version(bigint) to anon, authenticated;
grant execute on function private.can_read_catalogue_item(bigint) to anon, authenticated;

alter table public.catalogue_codes enable row level security;
alter table public.catalogue_records enable row level security;
alter table public.catalogue_versions enable row level security;
alter table public.catalogue_publications enable row level security;
alter table public.course_version_details enable row level security;
alter table public.structure_version_details enable row level security;
alter table public.catalogue_version_provenance enable row level security;

create policy catalogue_codes_read
on public.catalogue_codes
for select
to anon, authenticated
using ((select private.can_read_catalogue_item(id)));

create policy catalogue_codes_admin_write
on public.catalogue_codes
for all
to authenticated
using ((select private.can_manage_catalogue()))
with check ((select private.can_manage_catalogue()));

create policy catalogue_records_read
on public.catalogue_records
for select
to anon, authenticated
using (
  (published_version_id is not null and archived_at is null)
  or (select private.can_manage_catalogue())
  or (select private.can_read_catalogue_item(code_id))
);

create policy catalogue_records_admin_write
on public.catalogue_records
for all
to authenticated
using ((select private.can_manage_catalogue()))
with check ((select private.can_manage_catalogue()));

create policy catalogue_versions_read
on public.catalogue_versions
for select
to anon, authenticated
using ((select private.can_read_version(id)));

create policy catalogue_versions_admin_insert
on public.catalogue_versions
for insert
to authenticated
with check ((select private.can_manage_catalogue()));

create policy catalogue_publications_read
on public.catalogue_publications
for select
to anon, authenticated
using (
  (version_id is not null and (select private.is_published_version(version_id)))
  or (select private.can_manage_catalogue())
);

do $$
declare
  child text;
begin
  foreach child in array array[
    'course_version_details',
    'structure_version_details',
    'catalogue_version_provenance',
    'course_offerings',
    'offering_sessions',
    'course_learning_outcomes',
    'course_assessment_items',
    'course_assessment_outcomes',
    'course_fees',
    'course_attributes',
    'course_unit_options',
    'course_areas_of_interest',
    'course_related_courses',
    'course_rules',
    'course_rule_groups',
    'course_rule_conditions',
    'course_rule_condition_courses',
    'course_rule_course_references',
    'academic_structure_snapshot_sections',
    'academic_structure_summary_fields',
    'academic_structure_learning_outcomes',
    'academic_structure_fees',
    'academic_structure_snapshot_relationships',
    'academic_structure_requirement_groups',
    'academic_structure_requirement_conditions',
    'academic_structure_requirement_options',
    'academic_structure_unmodelled_requirements'
  ] loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated '
      'using ((select private.can_read_version(version_id)))',
      child || '_read',
      child
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      'with check ((select private.can_manage_catalogue()))',
      child || '_admin_insert',
      child
    );
  end loop;
end;
$$;

grant select on table
  public.catalogue_codes,
  public.catalogue_records,
  public.catalogue_versions,
  public.catalogue_publications,
  public.course_version_details,
  public.structure_version_details,
  public.catalogue_version_provenance
to anon, authenticated;

grant insert, update on table
  public.catalogue_codes,
  public.catalogue_records
to authenticated;

grant insert on table
  public.catalogue_versions,
  public.course_version_details,
  public.structure_version_details,
  public.catalogue_version_provenance
to authenticated;

grant select, insert, update on table
  public.catalogue_codes,
  public.catalogue_records,
  public.catalogue_versions,
  public.catalogue_publications,
  public.course_version_details,
  public.structure_version_details,
  public.catalogue_version_provenance
to service_role;

-- Published reads -----------------------------------------------------------------------

create or replace function private.course_version_projection(p_version_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with selected_snapshot as (
    select
      snapshots.id,
      snapshots.record_id,
      snapshots.academic_year_id,
      snapshots.origin,
      snapshots.source_page_id,
      snapshots.created_at,
      snapshots.sealed_at,
      details.*,
      items.code as course_code,
      academic_years.year as academic_year
    from public.catalogue_versions as snapshots
    join public.course_version_details as details
      on details.version_id = snapshots.id
    join public.catalogue_records as item_years
      on item_years.id = snapshots.record_id
    join public.catalogue_codes as items on items.id = item_years.code_id
    join public.academic_years
      on academic_years.id = snapshots.academic_year_id
    where snapshots.id = p_version_id
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
        'position', options.position,
        'units', options.units,
        'label', options.label,
        'sourceText', options.source_text
      ) order by options.position)
      from public.course_unit_options as options
      where options.version_id = p_version_id
    ), '[]'::jsonb),
    'fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', fees.position,
        'feeYear', fees.fee_year,
        'audience', fees.audience,
        'feeType', fees.fee_type,
        'amount', fees.amount,
        'currency', fees.currency,
        'basis', fees.basis,
        'studentContributionBand', fees.student_contribution_band,
        'sourceLabel', fees.source_label,
        'sourceText', fees.source_text
      ) order by fees.position)
      from public.course_fees as fees
      where fees.version_id = p_version_id
    ), '[]'::jsonb),
    'areasOfInterest', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', areas.position,
        'name', areas.name
      ) order by areas.position)
      from public.course_areas_of_interest as areas
      where areas.version_id = p_version_id
    ), '[]'::jsonb),
    'attributes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', attributes.position,
        'attributeKind', attributes.attribute_kind,
        'value', attributes.value,
        'sourceText', attributes.source_text
      ) order by attributes.position)
      from public.course_attributes as attributes
      where attributes.version_id = p_version_id
    ), '[]'::jsonb),
    'relatedCourses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', related.position,
        'relationKind', related.relation_kind,
        'sourceCourseCode', related.source_course_code,
        'sourceCourseTitle', related.source_course_title,
        'sourceText', related.source_text
      ) order by related.position)
      from public.course_related_courses as related
      where related.version_id = p_version_id
    ), '[]'::jsonb),
    'courseOffering', (
      select jsonb_build_object(
        'deliveryMode', offerings.delivery_mode,
        'location', offerings.location
      )
      from public.course_offerings as offerings
      where offerings.version_id = p_version_id
    ),
    'offeringSessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', sessions.position,
        'calendarYear', snapshot.academic_year,
        'academicPeriodCode', sessions.academic_period_code,
        'academicPeriodName', sessions.academic_period_name,
        'classNumber', sessions.class_number,
        'startsOn', sessions.starts_on,
        'enrolClosesOn', sessions.enrol_closes_on,
        'censusOn', sessions.census_on,
        'endsOn', sessions.ends_on,
        'deliveryMode', sessions.delivery_mode,
        'location', sessions.location,
        'classSummaryUrl', sessions.class_summary_url,
        'sourceText', sessions.source_text
      ) order by sessions.position)
      from public.offering_sessions as sessions
      where sessions.version_id = p_version_id
    ), '[]'::jsonb),
    'learningOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', outcomes.position,
        'body', outcomes.body
      ) order by outcomes.position)
      from public.course_learning_outcomes as outcomes
      where outcomes.version_id = p_version_id
    ), '[]'::jsonb),
    'assessmentItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', items.position,
        'title', items.title,
        'weight', items.weight,
        'hurdle', items.hurdle,
        'dueText', items.due_text,
        'sourceText', items.source_text
      ) order by items.position)
      from public.course_assessment_items as items
      where items.version_id = p_version_id
    ), '[]'::jsonb),
    'assessmentOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assessmentPosition', items.position,
        'learningOutcomePosition', outcomes.position
      ) order by items.position, outcomes.position)
      from public.course_assessment_outcomes as links
      join public.course_assessment_items as items
        on items.id = links.assessment_item_id
      join public.course_learning_outcomes as outcomes
        on outcomes.id = links.learning_outcome_id
      where links.version_id = p_version_id
    ), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', rules.rule_kind,
        'ruleKind', rules.rule_kind,
        'hardness', rules.hardness,
        'sourceText', rules.source_text,
        'reviewState', rules.review_state,
        'confidence', rules.confidence
      ) order by case rules.rule_kind
        when 'prerequisite' then 1
        when 'corequisite' then 2
        when 'incompatibility' then 3
        when 'permission' then 4
        when 'assumed_knowledge' then 5
        else 6
      end)
      from public.course_rules as rules
      where rules.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleGroups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', groups.projection_key,
        'ruleKey', rules.rule_kind,
        'parentGroupKey', parents.projection_key,
        'operator', groups.operator,
        'minimumCount', groups.minimum_count,
        'position', groups.position
      ) order by rules.rule_kind, groups.position, groups.id)
      from public.course_rule_groups as groups
      join public.course_rules as rules on rules.id = groups.course_rule_id
      left join public.course_rule_groups as parents
        on parents.id = groups.parent_group_id
      where groups.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleConditions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', conditions.projection_key,
        'ruleKey', rules.rule_kind,
        'groupKey', groups.projection_key,
        'position', conditions.position,
        'conditionKind', conditions.condition_kind,
        'requiredCourseCode', required_courses.code,
        'requiredStructureCode', required_structures.code,
        'minimumUnits', conditions.minimum_units,
        'minimumMark', conditions.minimum_mark,
        'subjectCode', conditions.subject_code,
        'minimumCourseLevel', conditions.minimum_course_level,
        'maximumCourseLevel', conditions.maximum_course_level,
        'minimumGpa', conditions.minimum_gpa,
        'minimumYear', conditions.minimum_year,
        'minimumWam', conditions.minimum_wam,
        'freeText', conditions.free_text,
        'courseRequirementMode', conditions.course_requirement_mode,
        'hardness', conditions.hardness,
        'sourceText', conditions.source_text,
        'reviewState', conditions.review_state,
        'confidence', conditions.confidence
      ) order by rules.rule_kind, conditions.position, conditions.id)
      from public.course_rule_conditions as conditions
      join public.course_rules as rules on rules.id = conditions.course_rule_id
      join public.course_rule_groups as groups on groups.id = conditions.group_id
      left join public.catalogue_codes as required_courses
        on required_courses.id = conditions.required_course_id
      left join public.catalogue_codes as required_structures
        on required_structures.id = conditions.required_structure_id
      where conditions.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleConditionCourses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'conditionKey', conditions.projection_key,
        'position', members.position,
        'sourceCourseCode', members.source_course_code,
        'sourceText', members.source_text
      ) order by conditions.id, members.position)
      from public.course_rule_condition_courses as members
      join public.course_rule_conditions as conditions
        on conditions.id = members.condition_id
      where members.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleCourseReferences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ruleKey', rules.rule_kind,
        'referencedCourseCode', referenced.code,
        'sourceText', rule_references.source_text,
        'reviewState', rule_references.review_state,
        'confidence', rule_references.confidence
      ) order by rules.rule_kind, referenced.code)
      from public.course_rule_course_references as rule_references
      join public.course_rules as rules on rules.id = rule_references.course_rule_id
      join public.catalogue_codes as referenced
        on referenced.id = rule_references.referenced_course_id
      where rule_references.version_id = p_version_id
    ), '[]'::jsonb),
    'prerequisiteCodes', coalesce((
      select jsonb_agg(codes.code order by codes.code)
      from (
        select referenced.code
        from public.course_rule_course_references as rule_references
        join public.course_rules as rules on rules.id = rule_references.course_rule_id
        join public.catalogue_codes as referenced
          on referenced.id = rule_references.referenced_course_id
        where rules.version_id = p_version_id
          and rules.rule_kind = 'prerequisite'
        union
        select required.code
        from public.course_rule_conditions as conditions
        join public.course_rules as rules on rules.id = conditions.course_rule_id
        join public.catalogue_codes as required
          on required.id = conditions.required_course_id
        where rules.version_id = p_version_id
          and rules.rule_kind = 'prerequisite'
          and conditions.condition_kind = 'course'
        union
        select members.source_course_code
        from public.course_rule_condition_courses as members
        join public.course_rule_conditions as conditions
          on conditions.id = members.condition_id
        join public.course_rules as rules on rules.id = conditions.course_rule_id
        where rules.version_id = p_version_id
          and rules.rule_kind = 'prerequisite'
      ) as codes
    ), '[]'::jsonb),
    'sourcePageId', snapshot.source_page_id,
    'sourceUpdatedAt', snapshot.source_updated_at,
    'createdAt', snapshot.created_at,
    'sealedAt', snapshot.sealed_at
  )
  from selected_snapshot as snapshot;
$function$;

revoke all on function private.course_version_projection(bigint)
from public, anon, authenticated;

create or replace function public.published_course_requisite_graph(
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
    select
      rule_references.referenced_course_id as from_item_id,
      published_snapshots.code_id as to_item_id
    from public.course_rule_course_references as rule_references
    join public.course_rules as rules on rules.id = rule_references.course_rule_id
    join published_snapshots on published_snapshots.version_id = rules.version_id
    where rules.rule_kind = 'prerequisite'
    union
    select conditions.required_course_id, published_snapshots.code_id
    from public.course_rule_conditions as conditions
    join public.course_rules as rules on rules.id = conditions.course_rule_id
    join published_snapshots on published_snapshots.version_id = rules.version_id
    where rules.rule_kind = 'prerequisite'
      and conditions.condition_kind = 'course'
      and conditions.required_course_id is not null
    union
    select members.referenced_course_id, published_snapshots.code_id
    from public.course_rule_condition_courses as members
    join public.course_rule_conditions as conditions
      on conditions.id = members.condition_id
    join public.course_rules as rules on rules.id = conditions.course_rule_id
    join published_snapshots on published_snapshots.version_id = rules.version_id
    where rules.rule_kind = 'prerequisite'
      and members.referenced_course_id is not null
  ),
  upstream as (
    select edges.from_item_id, edges.to_item_id
    from edges
    join root on root.code_id = edges.to_item_id
    union
    select edges.from_item_id, edges.to_item_id
    from edges
    join upstream on upstream.from_item_id = edges.to_item_id
  ),
  graph_edges as (
    select upstream.from_item_id, upstream.to_item_id from upstream
    union
    select edges.from_item_id, edges.to_item_id
    from edges
    join root on root.code_id = edges.from_item_id
  )
  select
    source_items.code as from_code,
    target_items.code as to_code,
    source_availability.code_id is not null as from_is_available,
    target_availability.code_id is not null as to_is_available
  from graph_edges
  join public.catalogue_codes as source_items
    on source_items.id = graph_edges.from_item_id
  join public.catalogue_codes as target_items
    on target_items.id = graph_edges.to_item_id
  left join published_snapshots as source_availability
    on source_availability.code_id = graph_edges.from_item_id
  left join published_snapshots as target_availability
    on target_availability.code_id = graph_edges.to_item_id
  order by source_items.code, target_items.code;
$function$;

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
  -- Security definer so the private projection is callable; the CTE selects
  -- only the published snapshot, so no draft content can be reached.
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
          'from', graph.from_code,
          'to', graph.to_code,
          'fromIsAvailable', graph.from_is_available,
          'toIsAvailable', graph.to_is_available
        ) order by graph.from_code, graph.to_code)
        from public.published_course_requisite_graph(
          selected.course_code,
          selected.academic_year
        ) as graph
      ), '[]'::jsonb)
    )
  from selected;
$function$;

create or replace function public.published_course_availability(
  p_course_code text,
  p_academic_year smallint
)
returns table (
  course_code text,
  academic_year smallint,
  is_available boolean,
  course_id bigint,
  course_year_id bigint,
  published_version_id bigint,
  offering_status text
)
language sql
stable
set search_path = ''
as $function$
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
$function$;

-- The course directory lists published snapshots with their identity in one
-- relation. Security invoker keeps the underlying row policies in force.
create view public.published_course_summaries
with (security_invoker = true)
as
select
  snapshots.id as version_id,
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
from public.catalogue_records as item_years
join public.catalogue_codes as items on items.id = item_years.code_id
join public.academic_years on academic_years.id = item_years.academic_year_id
join public.catalogue_versions as snapshots
  on snapshots.id = item_years.published_version_id
join public.course_version_details as details
  on details.version_id = snapshots.id
where item_years.kind = 'course'
  and item_years.archived_at is null;

grant select on public.published_course_summaries to anon, authenticated, service_role;

grant execute on function public.published_course_detail(text, smallint)
to anon, authenticated;
grant execute on function public.published_course_requisite_graph(text, smallint)
to anon, authenticated;
grant execute on function public.published_course_availability(text, smallint)
to anon, authenticated;

-- Student writes ---------------------------------------------------------------------

create or replace function public.current_user_course_attempt_version_projections(
  p_version_ids bigint[]
)
returns table (version_id bigint, projection jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  user_id uuid := (select auth.uid());
begin
  if user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_version_ids is null then
    raise exception 'Snapshot IDs are required.' using errcode = '22023';
  end if;
  if cardinality(p_version_ids) > 200 then
    raise exception 'At most 200 snapshot IDs may be requested.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_version_ids) as requested(requested_snapshot_id)
    where requested.requested_snapshot_id is null
  ) then
    raise exception 'Snapshot IDs cannot contain null values.'
      using errcode = '22023';
  end if;

  return query
  select
    snapshots.id,
    private.course_version_projection(snapshots.id)
  from public.catalogue_versions as snapshots
  where snapshots.id = any(p_version_ids)
    and snapshots.kind = 'course'
    and exists (
      select 1
      from public.course_attempts as attempts
      where attempts.catalogue_version_id = snapshots.id
        and attempts.owner_id = user_id
    )
  order by snapshots.id;
end;
$function$;

grant execute on function public.current_user_course_attempt_version_projections(bigint[])
to authenticated;

create or replace function public.add_current_user_plan_item(
  p_course_code text,
  p_academic_year smallint,
  p_planned_calendar_year smallint default null,
  p_planned_period_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  user_id uuid := (select auth.uid());
  selected_plan_id uuid;
  selected_record_id bigint;
  selected_period_id bigint;
  next_sort_order bigint;
  created_item_id uuid;
  period_code text := nullif(upper(btrim(p_planned_period_code)), '');
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_academic_year is null then
    raise exception using
      errcode = '22023',
      message = 'A course academic year is required.';
  end if;

  if (p_planned_calendar_year is null) <> (period_code is null) then
    raise exception using
      errcode = '22023',
      message = 'Planned year and period must be supplied together.';
  end if;

  if p_planned_calendar_year is not null
    and p_planned_calendar_year <> p_academic_year
  then
    raise exception using
      errcode = '22023',
      message = 'The planned period must be in the selected course academic year.';
  end if;

  select plans.id
  into selected_plan_id
  from public.plans
  where plans.owner_id = user_id
    and plans.is_primary
    and plans.status = 'active'
  for update of plans;

  if selected_plan_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Save a primary degree plan before adding courses.';
  end if;

  select item_years.id
  into selected_record_id
  from public.catalogue_codes as items
  join public.catalogue_records as item_years on item_years.code_id = items.id
  join public.academic_years
    on academic_years.id = item_years.academic_year_id
  where items.kind = 'course'
    and items.code = upper(btrim(p_course_code))
    and academic_years.year = p_academic_year
    and item_years.archived_at is null
    and item_years.published_version_id is not null
  limit 1;

  if selected_record_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The selected course has no published snapshot for the planned year.';
  end if;

  if p_planned_calendar_year is not null then
    select academic_periods.id
    into selected_period_id
    from public.academic_periods
    where academic_periods.calendar_year = p_planned_calendar_year
      and academic_periods.code = period_code
    limit 1;
  end if;

  select coalesce(max(plan_items.sort_order), -1) + 1
  into next_sort_order
  from public.plan_items
  where plan_items.plan_id = selected_plan_id
    and plan_items.owner_id = user_id
    and plan_items.planned_calendar_year is not distinct from p_planned_calendar_year
    and plan_items.planned_period_code is not distinct from period_code;

  insert into public.plan_items (
    plan_id,
    owner_id,
    catalogue_record_id,
    academic_period_id,
    planned_calendar_year,
    planned_period_code,
    sort_order
  ) values (
    selected_plan_id,
    user_id,
    selected_record_id,
    selected_period_id,
    p_planned_calendar_year,
    period_code,
    next_sort_order
  )
  returning id into created_item_id;

  return created_item_id;
end;
$function$;

grant execute on function public.add_current_user_plan_item(text, smallint, smallint, text)
to authenticated;

create or replace function public.move_current_user_plan_item(
  p_plan_item_id uuid,
  p_planned_calendar_year smallint default null,
  p_planned_period_code text default null,
  p_before_plan_item_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  user_id uuid := (select auth.uid());
  selected_plan_id uuid;
  selected_academic_year smallint;
  selected_period_id bigint;
  destination_sort_order bigint;
  period_code text := nullif(upper(btrim(p_planned_period_code)), '');
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if (p_planned_calendar_year is null) <> (period_code is null) then
    raise exception using
      errcode = '22023',
      message = 'Planned year and period must be supplied together.';
  end if;

  select plan_items.plan_id, academic_years.year
  into selected_plan_id, selected_academic_year
  from public.plan_items
  join public.catalogue_records
    on catalogue_records.id = plan_items.catalogue_record_id
  join public.academic_years
    on academic_years.id = catalogue_records.academic_year_id
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id
  for update of plan_items;

  if selected_plan_id is null then
    raise exception using errcode = 'P0002', message = 'Plan item not found.';
  end if;

  if p_planned_calendar_year is not null
    and p_planned_calendar_year <> selected_academic_year
  then
    raise exception using
      errcode = '22023',
      message = 'A planned course cannot be moved outside its selected academic year.';
  end if;

  perform 1
  from public.plan_items
  where plan_items.plan_id = selected_plan_id
    and plan_items.owner_id = user_id
  for update of plan_items;

  if p_planned_calendar_year is not null then
    select academic_periods.id
    into selected_period_id
    from public.academic_periods
    where academic_periods.calendar_year = p_planned_calendar_year
      and academic_periods.code = period_code
    limit 1;
  end if;

  if p_before_plan_item_id is not null then
    select plan_items.sort_order
    into destination_sort_order
    from public.plan_items
    where plan_items.id = p_before_plan_item_id
      and plan_items.owner_id = user_id
      and plan_items.plan_id = selected_plan_id
      and plan_items.id <> p_plan_item_id
      and plan_items.planned_calendar_year is not distinct from
        p_planned_calendar_year
      and plan_items.planned_period_code is not distinct from period_code;

    if destination_sort_order is null then
      raise exception using
        errcode = 'P0002',
        message = 'The requested destination item was not found.';
    end if;

    update public.plan_items
    set sort_order = plan_items.sort_order + 1
    where plan_items.plan_id = selected_plan_id
      and plan_items.owner_id = user_id
      and plan_items.id <> p_plan_item_id
      and plan_items.planned_calendar_year is not distinct from
        p_planned_calendar_year
      and plan_items.planned_period_code is not distinct from period_code
      and plan_items.sort_order >= destination_sort_order;
  else
    select coalesce(max(plan_items.sort_order), -1) + 1
    into destination_sort_order
    from public.plan_items
    where plan_items.plan_id = selected_plan_id
      and plan_items.owner_id = user_id
      and plan_items.id <> p_plan_item_id
      and plan_items.planned_calendar_year is not distinct from
        p_planned_calendar_year
      and plan_items.planned_period_code is not distinct from period_code;
  end if;

  update public.plan_items
  set
    academic_period_id = selected_period_id,
    planned_calendar_year = p_planned_calendar_year,
    planned_period_code = period_code,
    sort_order = destination_sort_order
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id;
end;
$function$;

create or replace function public.record_current_user_course_attempt(
  p_plan_item_id uuid,
  p_attempt_status text,
  p_attempt_mark numeric default null,
  p_units_attempted numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  user_id uuid := (select auth.uid());
  selected_record_id bigint;
  selected_calendar_year smallint;
  selected_period_code text;
  selected_period_id bigint;
  selected_snapshot_id bigint;
  selected_unit_value_kind text;
  selected_fixed_units numeric(6, 2);
  selected_minimum_units numeric(6, 2);
  selected_maximum_units numeric(6, 2);
  existing_attempt_id uuid;
  existing_snapshot_id bigint;
  existing_attempted_units numeric(5, 2);
  attempted_units numeric(5, 2);
  normalised_mark numeric(5, 2);
  created_attempt_id uuid;
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_attempt_status not in ('enrolled', 'completed', 'failed') then
    raise exception using
      errcode = '22023',
      message = 'Attempt status must be enrolled, completed or failed.';
  end if;

  if p_attempt_mark is not null and (p_attempt_mark < 0 or p_attempt_mark > 100) then
    raise exception using
      errcode = '22023',
      message = 'Attempt mark must be between 0 and 100.';
  end if;

  if p_units_attempted is not null and (
    p_units_attempted <= 0
    or p_units_attempted > 999.99
    or p_units_attempted <> round(p_units_attempted, 2)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Attempted units must be a positive value with at most two decimal places.';
  end if;

  normalised_mark := case
    when p_attempt_status = 'enrolled' then null
    else p_attempt_mark::numeric(5, 2)
  end;

  select
    plan_items.catalogue_record_id,
    plan_items.planned_calendar_year,
    plan_items.planned_period_code
  into
    selected_record_id,
    selected_calendar_year,
    selected_period_code
  from public.plan_items
  join public.plans on plans.id = plan_items.plan_id
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id
    and plans.owner_id = user_id
  for update of plan_items;

  if selected_record_id is null then
    raise exception using errcode = 'P0002', message = 'Plan item not found.';
  end if;

  if selected_calendar_year is null or selected_period_code is null then
    raise exception using
      errcode = '22023',
      message = 'Schedule the course in an academic period before recording an attempt.';
  end if;

  select academic_periods.id
  into selected_period_id
  from public.academic_periods
  where academic_periods.calendar_year = selected_calendar_year
    and academic_periods.code = selected_period_code;

  if selected_period_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The academic period is not available for recorded history.';
  end if;

  select
    course_attempts.id,
    course_attempts.catalogue_version_id,
    course_attempts.units_attempted
  into
    existing_attempt_id,
    existing_snapshot_id,
    existing_attempted_units
  from public.course_attempts
  join public.catalogue_versions as versions
    on versions.id = course_attempts.catalogue_version_id
  where course_attempts.owner_id = user_id
    and versions.record_id = selected_record_id
    and course_attempts.academic_period_id = selected_period_id
  for update;

  if existing_attempt_id is not null then
    if p_units_attempted is not null
      and p_units_attempted <> existing_attempted_units
    then
      raise exception using
        errcode = '22023',
        message = 'Attempted units cannot change after an attempt is recorded.';
    end if;

    selected_snapshot_id := existing_snapshot_id;
    attempted_units := existing_attempted_units;
  else
    select
      item_years.published_version_id,
      details.unit_value_kind,
      details.units,
      details.minimum_units,
      details.maximum_units
    into
      selected_snapshot_id,
      selected_unit_value_kind,
      selected_fixed_units,
      selected_minimum_units,
      selected_maximum_units
    from public.catalogue_records as item_years
    join public.course_version_details as details
      on details.version_id = item_years.published_version_id
    where item_years.id = selected_record_id
      and item_years.archived_at is null;

    if selected_snapshot_id is null then
      raise exception using
        errcode = 'P0002',
        message = 'The course has no published units for the attempted year.';
    end if;

    case selected_unit_value_kind
      when 'fixed' then
        if selected_fixed_units is null or selected_fixed_units <= 0 then
          raise exception using
            errcode = 'P0002',
            message = 'The course has no published units for the attempted year.';
        end if;

        if p_units_attempted is not null
          and p_units_attempted <> selected_fixed_units
        then
          raise exception using
            errcode = '22023',
            message = 'Attempted units must match the fixed course value.';
        end if;

        attempted_units := selected_fixed_units::numeric(5, 2);

      when 'range' then
        if p_units_attempted is null then
          raise exception using
            errcode = '22023',
            message = 'Choose the attempted units for this course.';
        end if;

        if selected_minimum_units is null
          or selected_maximum_units is null
          or selected_minimum_units <= 0
          or p_units_attempted < selected_minimum_units
          or p_units_attempted > selected_maximum_units
        then
          raise exception using
            errcode = '22023',
            message = 'Attempted units must be within the published course range.';
        end if;

        attempted_units := p_units_attempted::numeric(5, 2);

      when 'variable' then
        if p_units_attempted is null then
          raise exception using
            errcode = '22023',
            message = 'Choose the attempted units for this course.';
        end if;

        if not exists (
          select 1
          from public.course_unit_options
          where course_unit_options.version_id = selected_snapshot_id
            and course_unit_options.units = p_units_attempted
        ) then
          raise exception using
            errcode = '22023',
            message = 'Attempted units must match a published course unit option.';
        end if;

        attempted_units := p_units_attempted::numeric(5, 2);

      else
        raise exception using
          errcode = 'P0002',
          message = 'The course has no published units for the attempted year.';
    end case;
  end if;

  insert into public.course_attempts (
    owner_id,
    catalogue_version_id,
    academic_period_id,
    status,
    mark,
    grade,
    units_attempted,
    units_earned,
    source
  ) values (
    user_id,
    selected_snapshot_id,
    selected_period_id,
    p_attempt_status,
    normalised_mark,
    null,
    attempted_units,
    case when p_attempt_status = 'completed' then attempted_units else 0 end,
    'user_entered'
  )
  on conflict (owner_id, catalogue_version_id, academic_period_id) do update
  set
    status = excluded.status,
    mark = excluded.mark,
    grade = null,
    units_earned = case
      when excluded.status = 'completed'
        then course_attempts.units_attempted
      else 0
    end,
    source = 'user_entered',
    updated_at = now()
  where course_attempts.units_attempted = excluded.units_attempted
  returning id into created_attempt_id;

  if created_attempt_id is null then
    raise exception using
      errcode = '22023',
      message = 'Attempted units cannot change after an attempt is recorded.';
  end if;

  delete from public.plan_items
  where plan_items.id = p_plan_item_id
    and plan_items.owner_id = user_id;

  return created_attempt_id;
end;
$function$;

grant execute on function public.record_current_user_course_attempt(uuid, text, numeric, numeric)
to authenticated;

create or replace function public.save_current_user_academic_result(
  p_id uuid,
  p_operation text default 'save',
  p_mark numeric default null,
  p_grade text default null,
  p_units numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  owner uuid := auth.uid();
  target uuid;
  result_status text;
  result_mark numeric := p_mark;
  result_grade text := nullif(p_grade, '');
begin
  if owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_operation is null or p_operation not in ('save', 'clear', 'remove') then
    raise exception 'The result operation is invalid.' using errcode = '22023';
  end if;
  select id into target
  from public.course_attempts
  where id = p_id and owner_id = owner
  for update;
  if p_operation = 'remove' then
    if target is not null then
      delete from public.course_attempts where id = target and owner_id = owner;
    elsif not public.remove_current_user_plan_item(p_id) then
      raise exception 'The course was not found.' using errcode = '42501';
    end if;
    return p_id;
  end if;
  if p_operation = 'clear' then
    if target is null then
      raise exception 'The result was not found.' using errcode = '42501';
    end if;
    update public.course_attempts
    set status = 'enrolled', mark = null, grade = null, units_earned = 0
    where id = target and owner_id = owner;
    return target;
  end if;
  if result_grade is not null and result_grade not in (
    'PS', 'NCN', 'CRS', 'CRN', 'HLP', 'WD', 'WL', 'WN', 'DA', 'PX', 'RP', 'WA',
    'WF', 'KU', 'RC', 'STE', 'STI', 'EE'
  ) then
    raise exception 'The result code is invalid.' using errcode = '22023';
  end if;
  if result_grade = 'PS' then
    result_mark := 50;
  elsif result_grade = 'NCN' then
    result_mark := coalesce(result_mark, 0);
  elsif result_grade is not null then
    result_mark := null;
  end if;
  if (result_grade is null and result_mark is null)
    or result_mark < 0
    or result_mark > 100
    or result_mark::text in ('NaN', 'Infinity', '-Infinity')
    or result_mark <> round(result_mark, 2)
  then
    raise exception
      'The mark must be between 0 and 100 with up to two decimal places.'
      using errcode = '22023';
  end if;
  result_status := case
    when result_grade in ('NCN', 'WN', 'CRN') then 'failed'
    when result_grade in ('PS', 'CRS', 'HLP') then 'completed'
    when result_grade in ('WD', 'WL', 'STE', 'STI', 'EE') then 'withdrawn'
    when result_grade is not null then 'enrolled'
    when result_mark >= 50 then 'completed'
    else 'failed'
  end;
  if target is null then
    target := public.record_current_user_course_attempt(
      p_id,
      case when result_status = 'withdrawn' then 'enrolled' else result_status end,
      result_mark,
      p_units
    );
  end if;
  update public.course_attempts
  set
    status = result_status,
    mark = result_mark,
    grade = result_grade,
    units_earned = case when result_status = 'completed' then units_attempted else 0 end
  where id = target and owner_id = owner;
  return target;
end;
$function$;

grant execute on function public.save_current_user_academic_result(uuid, text, numeric, text, numeric)
to authenticated;

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
  selected_structure_record_id bigint;
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
    item_years.published_version_id,
    details.units,
    details.duration_years
  into
    selected_programme_year_id,
    selected_programme_snapshot_id,
    selected_programme_units,
    selected_programme_duration_years
  from public.catalogue_records as item_years
  join public.catalogue_codes as items on items.id = item_years.code_id
  join public.structure_version_details as details
    on details.version_id = item_years.published_version_id
  where items.code = upper(btrim(p_programme_code))
    and items.kind = 'programme'
    and item_years.academic_year_id = selected_academic_year_id
    and item_years.archived_at is null
    and item_years.published_version_id is not null
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
    selected_structure_record_id := null;

    select item_years.id
    into selected_structure_record_id
    from public.catalogue_records as item_years
    join public.catalogue_codes as items on items.id = item_years.code_id
    where items.code = selected_structure.code
      and items.kind = selected_structure.role
      and item_years.academic_year_id = selected_academic_year_id
      and item_years.archived_at is null
      and item_years.published_version_id is not null
    limit 1;

    if selected_structure_record_id is null then
      raise exception using
        errcode = 'P0002',
        message = format(
          'The selected %s is not published for that academic year.',
          selected_structure.role
        );
    end if;

    if not exists (
      select 1
      from public.academic_structure_snapshot_relationships as relationships
      where relationships.version_id = selected_programme_snapshot_id
        and relationships.relationship_kind in ('required', 'option')
        and relationships.target_kind = selected_structure.role
        and relationships.target_code = selected_structure.code
    ) and not exists (
      select 1
      from public.academic_structure_requirement_options as options
      join public.academic_structure_requirement_conditions as conditions
        on conditions.id = options.requirement_condition_id
       and conditions.version_id = options.version_id
      where options.version_id = selected_programme_snapshot_id
        and conditions.condition_kind = 'structure_list'
        and conditions.structure_kind = selected_structure.role
        and options.option_kind = 'structure'
        and options.structure_kind = selected_structure.role
        and options.option_code = selected_structure.code
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
    plan_id, owner_id, catalogue_record_id, role, position
  ) values (
    selected_plan_id, user_id, selected_programme_year_id, 'programme', 0
  );

  insert into public.plan_structures (
    plan_id, owner_id, catalogue_record_id, role, position
  )
  select
    selected_plan_id,
    user_id,
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
  join public.catalogue_codes as items
    on items.code = requested.code
   and items.kind = requested.role
  join public.catalogue_records as item_years
    on item_years.code_id = items.id
   and item_years.academic_year_id = selected_academic_year_id
   and item_years.archived_at is null
   and item_years.published_version_id is not null
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

grant execute on function public.save_current_user_primary_plan(
  text, text, smallint, smallint, text, text, text, text[], text[]
) to authenticated;

-- Recreating a function restores the default public execute grant, so the
-- student write functions are re-restricted to authenticated callers.
revoke all on function public.current_user_course_attempt_version_projections(bigint[])
from public, anon;
revoke all on function public.add_current_user_plan_item(text, smallint, smallint, text)
from public, anon;
revoke all on function public.record_current_user_course_attempt(uuid, text, numeric, numeric)
from public, anon;
revoke all on function public.save_current_user_academic_result(uuid, text, numeric, text, numeric)
from public, anon;
revoke all on function public.save_current_user_primary_plan(
  text, text, smallint, smallint, text, text, text, text[], text[]
) from public, anon;
revoke all on function public.published_course_detail(text, smallint) from public;
revoke all on function public.published_course_requisite_graph(text, smallint) from public;
revoke all on function public.published_course_availability(text, smallint) from public;

comment on table public.catalogue_codes is
  'Permanent identity for courses, programmes, majors, minors and specialisations.';
comment on table public.catalogue_records is
  'One row per catalogue item and academic year, holding the draft and published snapshot pointers.';
comment on table public.catalogue_versions is
  'Immutable versions of a catalogue item year. Kind-specific content lives in the details and child tables.';
comment on table public.catalogue_publications is
  'Ledger of every published pointer change for a catalogue item year.';

commit;
