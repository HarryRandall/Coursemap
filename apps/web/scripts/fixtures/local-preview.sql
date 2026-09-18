-- Minimal, loopback-only preview data for the snapshot-native course model.
-- The production/default Supabase seed remains empty.

begin;

do $seed$
declare
  demo_user_id constant uuid := '90000000-0000-4000-8000-000000000001';
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    phone_change,
    phone_change_token,
    email_change_token_current,
    email_change_confirm_status,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous,
    created_at,
    updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    demo_user_id,
    'authenticated',
    'authenticated',
    'test@test.com',
    extensions.crypt('testtest', extensions.gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    0,
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test Student"}'::jsonb,
    false,
    false,
    now(),
    now()
  )
  on conflict (id) do update
  set encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at,
      raw_app_meta_data = excluded.raw_app_meta_data,
      raw_user_meta_data = excluded.raw_user_meta_data,
      updated_at = now();

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    created_at,
    updated_at
  ) values (
    demo_user_id::text,
    demo_user_id,
    jsonb_build_object(
      'sub', demo_user_id::text,
      'email', 'test@test.com',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
  set user_id = excluded.user_id,
      identity_data = excluded.identity_data,
      updated_at = now();

  insert into public.profiles (id, email, display_name, student_number)
  values (demo_user_id, 'test@test.com', 'Test Student', 'u1234567')
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      student_number = excluded.student_number,
      updated_at = now();

  insert into private.user_roles (user_id, role_id, granted_by)
  select demo_user_id, roles.id, null
  from private.app_roles as roles
  where roles.key = 'admin'
  on conflict (user_id) do update
  set role_id = excluded.role_id,
      granted_by = null,
      granted_at = now();
end;
$seed$;

insert into public.catalogue_sources (name, kind, base_url, is_active)
values (
  'Coursemap local preview calendar',
  'local_mock',
  'https://coursemap.local.test',
  true
)
on conflict (kind, base_url) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

insert into public.catalogue_source_pages (
  source_id,
  academic_year_id,
  kind,
  external_key,
  canonical_url,
  content_sha256,
  source_last_modified,
  fetched_at
)
select
  sources.id,
  years.id,
  'calendar',
  '2026-KEY-DATES',
  'https://coursemap.local.test/2026/key-dates',
  md5('coursemap-local-2026-key-dates') || md5('published-calendar'),
  '2026-08-01 00:00:00+10',
  '2026-08-01 00:00:00+10'
from public.catalogue_sources as sources
join public.academic_years as years on years.year = 2026
where sources.kind = 'local_mock'
  and sources.base_url = 'https://coursemap.local.test'
on conflict (
  source_id,
  academic_year_id,
  kind,
  external_key,
  content_sha256
) do nothing;

update public.academic_years
set calendar_published_at = '2026-08-01 00:00:00+10'
where year = 2026;

insert into public.university_calendar_events (
  academic_year_id,
  calendar_year,
  event_date,
  title,
  status,
  source_page_id
)
select
  years.id,
  2026,
  events.event_date,
  events.title,
  'published',
  pages.id
from (
  values
    ('2026-01-01'::date, 'New Year''s Day public holiday'),
    ('2026-01-02'::date, 'University offices re-open'),
    ('2026-02-16'::date, 'Orientation Week begins'),
    ('2026-02-23'::date, 'First Semester begins'),
    ('2026-03-31'::date, 'First Semester census date'),
    ('2026-04-03'::date, 'Good Friday public holiday'),
    ('2026-05-25'::date, 'First Semester examination period begins'),
    ('2026-06-26'::date, 'First Semester results released'),
    ('2026-07-20'::date, 'Second Semester orientation begins'),
    ('2026-07-27'::date, 'Second Semester begins'),
    ('2026-08-31'::date, 'Second Semester census date'),
    ('2026-09-07'::date, 'Teaching break commences'),
    ('2026-09-21'::date, 'Teaching resumes after the break'),
    ('2026-10-26'::date, 'Second Semester examination period begins'),
    ('2026-11-20'::date, 'Second Semester results released'),
    ('2026-12-14'::date, 'Graduation ceremonies commence')
) as events(event_date, title)
join public.academic_years as years on years.year = 2026
join public.catalogue_source_pages as pages
  on pages.kind = 'calendar'
 and pages.external_key = '2026-KEY-DATES'
 and pages.academic_year_id = years.id
join public.catalogue_sources as sources
  on sources.id = pages.source_id
 and sources.kind = 'local_mock'
 and sources.base_url = 'https://coursemap.local.test'
on conflict (calendar_year, event_date, title) do update
set status = excluded.status,
    source_page_id = excluded.source_page_id,
    updated_at = now();

insert into public.academic_periods (
  calendar_year,
  code,
  name,
  short_name,
  starts_on,
  ends_on,
  sort_order,
  status
) values
  (2026, 'S1', 'Semester 1', 'S1', '2026-02-23', '2026-06-28', 1, 'published'),
  (2026, 'S2', 'Semester 2', 'S2', '2026-07-27', '2026-11-22', 2, 'published'),
  (2027, 'S1', 'Semester 1', 'S1', '2027-02-22', '2027-06-27', 1, 'published'),
  (2027, 'S2', 'Semester 2', 'S2', '2027-07-26', '2027-11-21', 2, 'published'),
  (2028, 'S1', 'Semester 1', 'S1', '2028-02-21', '2028-06-25', 1, 'published'),
  (2028, 'S2', 'Semester 2', 'S2', '2028-07-24', '2028-11-19', 2, 'published')
on conflict (calendar_year, code) do update
set name = excluded.name,
    short_name = excluded.short_name,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    sort_order = excluded.sort_order,
    status = excluded.status,
    updated_at = now();

update public.academic_years
set source_availability = 'available',
    availability_checked_at = '2026-08-01 00:00:00+10',
    directory_refreshed_at = '2026-08-01 00:00:00+10',
    availability_note = 'Local preview fixture'
where year = 2026;

-- Published academic structures for exercising the complete student selection
-- and requirements flow locally. These remain loopback-only fixture records.
insert into public.catalogue_items (kind, code)
values
  ('programme', 'LOCAL-PROGRAMME'),
  ('major', 'LOCAL-MAJ'),
  ('minor', 'LOCALA-MIN'),
  ('minor', 'LOCALB-MIN'),
  ('specialisation', 'LOCAL-SPEC'),
  ('course', 'COMP1100'),
  ('course', 'COMP1110'),
  ('course', 'MATH1005')
on conflict (kind, code) do nothing;

-- MATH1005 deliberately remains an identity only. It is visible as a
-- prerequisite placeholder without pretending its full 2026 course page has
-- been imported.
insert into public.catalogue_item_years (item_id, kind, academic_year_id)
select items.id, items.kind, years.id
from public.catalogue_items as items
join public.academic_years as years on years.year = 2026
where items.code <> 'MATH1005'
on conflict (item_id, academic_year_id) do nothing;

insert into public.catalogue_source_pages (
  source_id,
  academic_year_id,
  kind,
  external_key,
  canonical_url,
  content_sha256,
  http_status,
  byte_size
)
select
  sources.id,
  years.id,
  'course',
  documents.external_key,
  'https://coursemap.local.test/2026/' || lower(documents.external_key),
  documents.content_sha256,
  200,
  1024
from public.catalogue_sources as sources
join public.academic_years as years on years.year = 2026
cross join (values
  ('COMP1100'::text, repeat('1', 64)),
  ('COMP1110'::text, repeat('2', 64))
) as documents(external_key, content_sha256)
where sources.kind = 'local_mock'
on conflict (source_id, academic_year_id, kind, external_key, content_sha256) do nothing;

-- One snapshot per item year. Course snapshots carry their source page; the
-- structure fixtures are manual.
insert into public.catalogue_snapshots (
  item_year_id,
  kind,
  academic_year_id,
  origin,
  source_page_id,
  content_hash,
  created_by
)
select
  item_years.id,
  item_years.kind,
  item_years.academic_year_id,
  case when item_years.kind = 'course' then 'import' else 'manual' end,
  pages.id,
  md5(items.code || ':2026:local-preview') || md5('published:' || items.code),
  '90000000-0000-4000-8000-000000000001'::uuid
from public.catalogue_item_years as item_years
join public.catalogue_items as items on items.id = item_years.item_id
left join public.catalogue_source_pages as pages
  on pages.academic_year_id = item_years.academic_year_id
 and pages.kind = 'course'
 and pages.external_key = items.code;

insert into public.structure_snapshot_details (
  snapshot_id,
  kind,
  name,
  description,
  units,
  duration_years
)
select
  snapshots.id,
  snapshots.kind,
  case items.code
    when 'LOCAL-PROGRAMME' then 'Local Bachelor of Testing'
    when 'LOCAL-MAJ' then 'Local Systems Major'
    when 'LOCALA-MIN' then 'Local Data Minor'
    when 'LOCALB-MIN' then 'Local Design Minor'
    else 'Local Artificial Intelligence Specialisation'
  end,
  'Published local fixture used to verify student academic structure selection.',
  case snapshots.kind
    when 'programme' then 144
    when 'major' then 48
    else 24
  end,
  case when snapshots.kind = 'programme' then 3 else null end
from public.catalogue_snapshots as snapshots
join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
join public.catalogue_items as items on items.id = item_years.item_id
where snapshots.kind <> 'course';

insert into public.academic_structure_snapshot_relationships (
  snapshot_id,
  position,
  relationship_kind,
  target_kind,
  target_code,
  target_title,
  source_text,
  source_locator
)
select
  snapshots.id,
  options.position,
  'option',
  options.target_kind,
  options.target_code,
  options.target_title,
  options.source_text,
  '#local-structure-options'
from public.catalogue_snapshots as snapshots
join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
join public.catalogue_items as items on items.id = item_years.item_id
cross join (
  values
    (1, 'major'::text, 'LOCAL-MAJ'::text, 'Local Systems Major'::text, 'Choose the Local Systems Major.'::text),
    (2, 'minor', 'LOCALA-MIN', 'Local Data Minor', 'Choose the Local Data Minor.'),
    (3, 'minor', 'LOCALB-MIN', 'Local Design Minor', 'Choose the Local Design Minor.'),
    (4, 'specialisation', 'LOCAL-SPEC', 'Local Artificial Intelligence Specialisation', 'Choose the Local Artificial Intelligence Specialisation.')
) as options(position, target_kind, target_code, target_title, source_text)
where items.code = 'LOCAL-PROGRAMME';

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
  details.name || ' requirements',
  'all_of',
  'Complete all published requirements for ' || details.name || '.',
  '#local-requirements',
  0
from public.catalogue_snapshots as snapshots
join public.structure_snapshot_details as details on details.snapshot_id = snapshots.id;

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
  'root:local-requirement',
  case when snapshots.kind = 'programme' then 'unit_total' else 'course_list' end,
  case when snapshots.kind = 'programme' then 144 else 6 end,
  case
    when snapshots.kind = 'programme' then 'Complete 144 units.'
    else 'Complete the listed local fixture course.'
  end,
  '#local-requirements'
from public.academic_structure_requirement_groups as groups
join public.catalogue_snapshots as snapshots on snapshots.id = groups.snapshot_id;

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
  1,
  'course',
  case items.code
    when 'LOCAL-MAJ' then 'COMP1110'
    when 'LOCALA-MIN' then 'MATH1005'
    when 'LOCALB-MIN' then 'COMP1100'
    else 'COMP1110'
  end
from public.academic_structure_requirement_conditions as conditions
join public.catalogue_snapshots as snapshots on snapshots.id = conditions.snapshot_id
join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
join public.catalogue_items as items on items.id = item_years.item_id
where snapshots.kind not in ('programme', 'course');

-- Published courses ------------------------------------------------------------

insert into public.course_snapshot_details (
  snapshot_id,
  title,
  unit_value_kind,
  units,
  eftsl,
  level,
  subject_code,
  subject_name,
  school,
  college,
  academic_career,
  convener_text,
  delivery_summary,
  introduction,
  description,
  workload_text,
  workload_hours,
  inherent_requirements,
  prescribed_texts,
  offering_status,
  source_updated_at
)
select
  snapshots.id,
  case items.code
    when 'COMP1100' then 'Programming as Problem Solving'
    else 'Structured Programming'
  end,
  'fixed',
  6,
  0.125,
  1000,
  'COMP',
  'Computer Science',
  'School of Computing',
  'ANU College of Systems and Society',
  'UGRD',
  'Local preview convenor',
  'In person at Acton campus',
  'A compact local preview of a parsed ANU course.',
  case items.code
    when 'COMP1100' then 'Learn foundational programming and problem solving.'
    else 'Develop structured programming techniques using larger programs.'
  end,
  'Approximately ten hours per week.',
  10,
  'None listed.',
  'No prescribed text.',
  'offered',
  '2026-08-01 00:00:00+10'
from public.catalogue_snapshots as snapshots
join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
join public.catalogue_items as items on items.id = item_years.item_id
where snapshots.kind = 'course';

-- Fixed-unit courses store their single value on the details row. Unit
-- options are reserved for courses whose unit value is variable.

insert into public.course_fees (
  snapshot_id,
  position,
  fee_year,
  audience,
  fee_type,
  amount,
  currency,
  basis,
  source_label,
  source_text
)
select
  snapshots.id,
  1,
  2026,
  'domestic',
  'indicative',
  1110,
  'AUD',
  'course',
  'Indicative domestic fee',
  'Indicative domestic fee: $1,110'
from public.catalogue_snapshots as snapshots
where snapshots.kind = 'course';

insert into public.course_areas_of_interest (snapshot_id, position, name)
select snapshots.id, 1, 'Computer Science'
from public.catalogue_snapshots as snapshots
where snapshots.kind = 'course';

insert into public.course_attributes (
  snapshot_id,
  position,
  attribute_kind,
  value,
  source_text
)
select snapshots.id, 1, 'stem', 'STEM', 'STEM course'
from public.catalogue_snapshots as snapshots
where snapshots.kind = 'course';

insert into public.course_offerings (
  snapshot_id,
  academic_year_id,
  source_page_id,
  delivery_mode,
  location
)
select
  snapshots.id,
  snapshots.academic_year_id,
  snapshots.source_page_id,
  'In person',
  'Acton'
from public.catalogue_snapshots as snapshots
where snapshots.kind = 'course';

insert into public.offering_sessions (
  course_offering_id,
  snapshot_id,
  academic_year_id,
  source_page_id,
  academic_period_id,
  academic_period_code,
  academic_period_name,
  position,
  class_number,
  starts_on,
  enrol_closes_on,
  census_on,
  ends_on,
  delivery_mode,
  location,
  class_summary_url,
  source_text
)
select
  offerings.id,
  snapshots.id,
  snapshots.academic_year_id,
  snapshots.source_page_id,
  periods.id,
  'S1',
  'Semester 1',
  1,
  case items.code when 'COMP1100' then '11001' else '11101' end,
  '2026-02-23',
  '2026-03-02',
  '2026-03-31',
  '2026-05-30',
  'In person',
  'Acton',
  'https://coursemap.local.test/2026/classes/' || lower(items.code),
  'Semester 1, in person at Acton'
from public.catalogue_snapshots as snapshots
join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
join public.catalogue_items as items on items.id = item_years.item_id
join public.course_offerings as offerings on offerings.snapshot_id = snapshots.id
join public.academic_periods as periods
  on periods.calendar_year = 2026
 and periods.code = 'S1'
where snapshots.kind = 'course';

insert into public.course_learning_outcomes (snapshot_id, position, body)
select snapshots.id, 1, 'Apply foundational programming concepts.'
from public.catalogue_snapshots as snapshots
where snapshots.kind = 'course';

insert into public.course_assessment_items (
  snapshot_id,
  position,
  title,
  weight,
  hurdle,
  due_text,
  source_text
)
select
  snapshots.id,
  1,
  'Programming assignment',
  40,
  false,
  'Week 8',
  'Programming assignment (40%)'
from public.catalogue_snapshots as snapshots
where snapshots.kind = 'course';

insert into public.course_assessment_outcomes (
  snapshot_id,
  assessment_item_id,
  learning_outcome_id
)
select snapshots.id, assessments.id, outcomes.id
from public.catalogue_snapshots as snapshots
join public.course_assessment_items as assessments
  on assessments.snapshot_id = snapshots.id
join public.course_learning_outcomes as outcomes
  on outcomes.snapshot_id = snapshots.id
 and outcomes.position = 1
where snapshots.kind = 'course';

insert into public.snapshot_field_evidence (
  snapshot_id,
  academic_year_id,
  source_page_id,
  field_path,
  method,
  confidence,
  source_locator,
  source_excerpt
)
select
  snapshots.id,
  snapshots.academic_year_id,
  snapshots.source_page_id,
  'title',
  'deterministic',
  0.99,
  'h1',
  details.title
from public.catalogue_snapshots as snapshots
join public.course_snapshot_details as details on details.snapshot_id = snapshots.id;

insert into public.course_rules (
  snapshot_id,
  academic_year_id,
  source_page_id,
  rule_kind,
  hardness,
  source_text,
  review_state,
  confidence
)
select
  snapshots.id,
  snapshots.academic_year_id,
  snapshots.source_page_id,
  'prerequisite',
  'hard',
  'You must have completed MATH1005.',
  'verified',
  0.99
from public.catalogue_snapshots as snapshots
join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
join public.catalogue_items as items on items.id = item_years.item_id
where items.code = 'COMP1110';

insert into public.course_rule_groups (
  course_rule_id,
  snapshot_id,
  projection_key,
  parent_group_id,
  operator,
  minimum_count,
  position
)
select
  rules.id,
  rules.snapshot_id,
  'prerequisite:group:root',
  null,
  'all_of',
  null,
  0
from public.course_rules as rules;

insert into public.course_rule_conditions (
  course_rule_id,
  snapshot_id,
  projection_key,
  group_id,
  condition_kind,
  required_course_id,
  course_requirement_mode,
  hardness,
  source_text,
  confidence,
  review_state,
  position
)
select
  rules.id,
  rules.snapshot_id,
  'prerequisite:condition:0',
  groups.id,
  'course',
  prerequisite.id,
  'completed',
  'hard',
  'You must have completed MATH1005.',
  0.99,
  'verified',
  0
from public.course_rules as rules
join public.course_rule_groups as groups on groups.course_rule_id = rules.id
join public.catalogue_items as prerequisite
  on prerequisite.kind = 'course' and prerequisite.code = 'MATH1005';

insert into public.course_rule_course_references (
  course_rule_id,
  snapshot_id,
  referenced_course_id,
  source_text,
  confidence,
  review_state
)
select
  rules.id,
  rules.snapshot_id,
  prerequisite.id,
  'MATH1005',
  0.99,
  'verified'
from public.course_rules as rules
join public.catalogue_items as prerequisite
  on prerequisite.kind = 'course' and prerequisite.code = 'MATH1005';

-- Setting the publication pointer is the only publication action. The pointer
-- trigger seals each snapshot after every child row has been stored.
update public.catalogue_item_years as item_years
set published_snapshot_id = snapshots.id
from public.catalogue_snapshots as snapshots
where snapshots.item_year_id = item_years.id;

commit;
