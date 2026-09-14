begin;
\ir ../helpers/catalogue-review.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

select extensions.ok(
  to_regclass('public.academic_structure_versions') is null
  and to_regclass('public.academic_structure_relationships') is null
  and to_regclass('public.requirement_groups') is null
  and to_regclass('public.requirement_conditions') is null,
  'the legacy programme version and requirement tables are removed'
);

select extensions.is(
  (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'academic_structure_sources',
        'academic_structure_source_pages',
        'academic_structure_directory_entries',
        'academic_structure_years',
        'academic_structure_snapshots',
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
      )
  ),
  15::bigint,
  'the snapshot-native academic structure tables are available'
);

insert into public.academic_structure_source_pages (
  source_id,
  academic_year_id,
  page_kind,
  structure_kind,
  external_key,
  canonical_url,
  media_type,
  content_sha256,
  byte_size,
  http_status
)
select
  sources.id,
  years.id,
  'structure',
  'programme',
  'CAPABILITY-PROGRAMME',
  'https://programsandcourses.anu.edu.au/2026/program/CAPABILITY-PROGRAMME',
  'text/html',
  repeat('7', 64),
  512,
  200
from public.academic_structure_sources as sources
join public.academic_years as years on years.year = 2026
where sources.kind = 'anu_programs_and_courses';

insert into public.academic_structures (code, kind)
values ('CAPABILITY-PROGRAMME', 'programme');

insert into public.academic_structure_years (structure_id, academic_year_id)
select structures.id, years.id
from public.academic_structures as structures
join public.academic_years as years on years.year = 2026
where structures.code = 'CAPABILITY-PROGRAMME'
  and structures.kind = 'programme';

set local role service_role;
savepoint academic_structure_snapshot_assembly;

insert into public.academic_structure_snapshots (
  structure_year_id,
  academic_year_id,
  source_page_id,
  origin,
  schema_version,
  semantic_hash,
  name,
  units
)
select
  structure_years.id,
  structure_years.academic_year_id,
  source_pages.id,
  'manual',
  'academic-structure-snapshot.test',
  repeat('8', 64),
  'Capability programme',
  144
from public.academic_structure_years as structure_years
join public.academic_structures as structures
  on structures.id = structure_years.structure_id
join public.academic_structure_source_pages as source_pages
  on source_pages.academic_year_id = structure_years.academic_year_id
 and source_pages.external_key = structures.code
where structures.code = 'CAPABILITY-PROGRAMME';

insert into public.academic_structure_requirement_groups (
  snapshot_id,
  group_key,
  title,
  operator,
  source_text,
  source_locator,
  position
)
select
  snapshots.id,
  'root',
  'Programme requirements',
  'all_of',
  'Complete the programme requirements.',
  '#program-requirements',
  0
from public.academic_structure_snapshots as snapshots
where snapshots.name = 'Capability programme';

insert into public.academic_structure_requirement_conditions (
  snapshot_id,
  requirement_group_id,
  position,
  projection_key,
  condition_kind,
  minimum_units,
  source_text,
  source_locator
)
select
  groups.snapshot_id,
  groups.id,
  0,
  'root:course-options',
  'course_list',
  6,
  'Complete 6 units from PGMI1000 or PGMX1000.',
  '#program-requirements'
from public.academic_structure_requirement_groups as groups
join public.academic_structure_snapshots as snapshots
  on snapshots.id = groups.snapshot_id
where groups.group_key = 'root'
  and snapshots.name = 'Capability programme';

insert into public.academic_structure_requirement_options (
  snapshot_id,
  requirement_condition_id,
  position,
  option_kind,
  option_code
)
select
  conditions.snapshot_id,
  conditions.id,
  options.position,
  'course',
  options.code
from public.academic_structure_requirement_conditions as conditions
cross join (values (1, 'PGMI1000'::text), (2, 'PGMX1000'))
  as options(position, code)
where conditions.projection_key = 'root:course-options';

release savepoint academic_structure_snapshot_assembly;
reset role;

select extensions.ok(
  exists (
    select 1
    from public.academic_structure_requirement_groups as groups
    join public.academic_structure_requirement_conditions as conditions
      on conditions.requirement_group_id = groups.id
     and conditions.snapshot_id = groups.snapshot_id
    where groups.group_key = 'root'
      and conditions.condition_kind = 'course_list'
  ),
  'the service worker can assemble a snapshot and its requirement tree inside a savepoint'
);

select extensions.is(
  (
    select count(*)
    from public.academic_structure_requirement_options
    where option_code in ('PGMI1000', 'PGMX1000')
  ),
  2::bigint,
  'course choices are stored lexically without recursively importing courses'
);

select extensions.is(
  (
    select count(*)
    from public.courses
    where code in ('PGMI1000', 'PGMX1000')
  ),
  0::bigint,
  'academic structure requirements do not create course identities'
);

select extensions.throws_ok(
  $$
    insert into public.academic_structure_requirement_groups (
      snapshot_id, group_key, title, operator, source_text, source_locator, position
    )
    select id, 'second-root', 'Invalid root', 'all_of', 'Invalid root', '#invalid', 1
    from public.academic_structure_snapshots
    where name = 'Capability programme'
  $$,
  '23505',
  null,
  'a snapshot cannot have two root requirement groups'
);

update public.academic_structure_years as structure_years
set draft_snapshot_id = snapshots.id
from public.academic_structure_snapshots as snapshots
join public.academic_structures as structures
  on structures.code = 'CAPABILITY-PROGRAMME'
where snapshots.structure_year_id = structure_years.id
  and structure_years.structure_id = structures.id;

select extensions.throws_ok(
  $$
    insert into public.academic_structure_unmodelled_requirements (
      snapshot_id, position, source_text, source_locator
    )
    select id, 1, 'Late draft mutation', '#late-draft-mutation'
    from public.academic_structure_snapshots
    where name = 'Capability programme'
  $$,
  '55000',
  'Academic structure projected rows may only be inserted while their snapshot is being assembled.',
  'projected rows cannot be appended after a snapshot becomes the draft'
);

select pg_temp.approve_catalogue_fixture('programme', snapshots.id)
from public.academic_structure_snapshots as snapshots
join public.academic_structures as structures
  on structures.code = 'CAPABILITY-PROGRAMME'
cross join public.academic_structure_years as structure_years
where snapshots.structure_year_id = structure_years.id
  and structure_years.structure_id = structures.id;

update public.academic_structure_years as structure_years
set draft_snapshot_id = null, published_snapshot_id = snapshots.id
from public.academic_structure_snapshots as snapshots
join public.academic_structures as structures
  on structures.code = 'CAPABILITY-PROGRAMME'
where snapshots.structure_year_id = structure_years.id
  and structure_years.structure_id = structures.id;

select extensions.throws_ok(
  $$
    insert into public.academic_structure_learning_outcomes (
      snapshot_id, position, outcome_text, source_text, source_locator
    )
    select id, 1, 'Late publication mutation', 'Late publication mutation', '#late-publication-mutation'
    from public.academic_structure_snapshots
    where name = 'Capability programme'
  $$,
  '55000',
  'Academic structure projected rows may only be inserted while their snapshot is being assembled.',
  'projected rows cannot be appended after a snapshot is published'
);

update public.academic_structure_years as structure_years
set draft_snapshot_id = snapshots.id, published_snapshot_id = null
from public.academic_structure_snapshots as snapshots
join public.academic_structures as structures
  on structures.code = 'CAPABILITY-PROGRAMME'
where snapshots.structure_year_id = structure_years.id
  and structure_years.structure_id = structures.id;

select extensions.throws_ok(
  $$
    update public.academic_structure_snapshots
    set name = 'Mutated programme'
    where name = 'Capability programme'
  $$,
  '55000',
  'Academic structure snapshots and their projected rows are immutable.',
  'sealed academic structure snapshots cannot be edited in place'
);

select extensions.ok(
  exists (
    select 1
    from public.academic_structure_years as structure_years
    join public.academic_structure_snapshots as snapshots
      on snapshots.id = structure_years.draft_snapshot_id
    where snapshots.name = 'Capability programme'
      and structure_years.published_snapshot_id is null
  ),
  'reviewed structure data remains a draft until explicitly published'
);

rollback;
