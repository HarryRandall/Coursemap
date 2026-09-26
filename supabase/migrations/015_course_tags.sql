-- Free-form course tags.
--
-- Degree rules can ask for units of courses "tagged" with a category, such as
-- Science, that ANU does not publish as a field. A tag is read from the course
-- page by the extraction model, or written by an administrator, and lives on
-- the course version like its areas of interest: it is drafted, reviewed,
-- published and sealed with the rest of the version. The model's confidence
-- for each tag is kept with the version's field provenance, not here.

create table if not exists public.course_tags (
    id bigint not null,
    version_id bigint not null,
    position integer not null,
    name text not null,
    created_at timestamp with time zone default now() not null,
    constraint course_tags_name_not_blank_check check ((btrim(name) <> ''::text)),
    constraint course_tags_name_trimmed_check check ((name = btrim(name))),
    constraint course_tags_position_check check ((position > 0))
);

alter table public.course_tags alter column id add generated always as identity (
    sequence name public.course_tags_id_seq
    start with 1
    increment by 1
    no minvalue
    no maxvalue
    cache 1
);

alter table only public.course_tags
    add constraint course_tags_pkey primary key (id);

alter table only public.course_tags
    add constraint course_tags_snapshot_position_unique unique (version_id, position);

alter table only public.course_tags
    add constraint course_tags_snapshot_id_fkey foreign key (version_id)
      references public.catalogue_versions(id) on delete cascade;

-- A tag is one category however it is capitalised.
create unique index course_tags_snapshot_name_unique
    on public.course_tags using btree (version_id, lower(name));

create index course_tags_course_snapshot_id_idx
    on public.course_tags using btree (version_id);

-- The course explorer filters by tag.
create index course_tags_name_idx
    on public.course_tags using btree (lower(name));

create or replace trigger course_tags_guard_sealed
    before insert or delete or update on public.course_tags
    for each row execute function private.guard_snapshot_child_mutation();

alter table public.course_tags enable row level security;

create policy course_tags_admin_insert on public.course_tags
    for insert to authenticated
    with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_tags_read on public.course_tags
    for select to authenticated, anon
    using (( select private.can_read_version(course_tags.version_id) as can_read_version));

revoke all on table public.course_tags from public, anon, authenticated, service_role;
revoke all on sequence public.course_tags_id_seq from public, anon, authenticated, service_role;
grant all on table public.course_tags to service_role;
grant select on table public.course_tags to authenticated;
grant select on table public.course_tags to anon;
grant all on sequence public.course_tags_id_seq to service_role;
grant select,usage on sequence public.course_tags_id_seq to authenticated;

comment on table public.course_tags is 'Free-form categories on a course version, such as Science, that degree rules count units against.';

create or replace function private.course_version_projection(p_version_id bigint) returns jsonb
    language sql stable
    set search_path to ''
    as $$
  with selected_snapshot as (
    select
      snapshots.id,
      snapshots.record_id,
      snapshots.academic_year_id,
      snapshots.origin,
      snapshots.source_document_id,
      snapshots.created_at,
      snapshots.sealed_at,
      details.*,
      items.code as course_code,
      academic_years.year as academic_year
    from public.catalogue_versions as snapshots
    join public.course_version_details as details on details.version_id = snapshots.id
    join public.catalogue_records as item_years on item_years.id = snapshots.record_id
    join public.catalogue_codes as items on items.id = item_years.code_id
    join public.academic_years on academic_years.id = snapshots.academic_year_id
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
        'position', options.position, 'units', options.units,
        'label', options.label, 'sourceText', options.source_text
      ) order by options.position)
      from public.course_unit_options as options where options.version_id = p_version_id
    ), '[]'::jsonb),
    'fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', fees.position, 'feeYear', fees.fee_year, 'audience', fees.audience,
        'feeType', fees.fee_type, 'amount', fees.amount, 'currency', fees.currency,
        'basis', fees.basis, 'studentContributionBand', fees.student_contribution_band,
        'sourceLabel', fees.source_label, 'sourceText', fees.source_text
      ) order by fees.position)
      from public.course_fees as fees where fees.version_id = p_version_id
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('position', tags.position, 'name', tags.name)
        order by tags.position)
      from public.course_tags as tags where tags.version_id = p_version_id
    ), '[]'::jsonb),
    'areasOfInterest', coalesce((
      select jsonb_agg(jsonb_build_object('position', areas.position, 'name', areas.name)
        order by areas.position)
      from public.course_areas_of_interest as areas where areas.version_id = p_version_id
    ), '[]'::jsonb),
    'attributes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', attributes.position, 'attributeKind', attributes.attribute_kind,
        'value', attributes.value, 'sourceText', attributes.source_text
      ) order by attributes.position)
      from public.course_attributes as attributes where attributes.version_id = p_version_id
    ), '[]'::jsonb),
    'relatedCourses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', related.position, 'relationKind', related.relation_kind,
        'sourceCourseCode', related.source_course_code,
        'sourceCourseTitle', related.source_course_title, 'sourceText', related.source_text
      ) order by related.position)
      from public.course_related_courses as related where related.version_id = p_version_id
    ), '[]'::jsonb),
    'courseOffering', (
      select jsonb_build_object('deliveryMode', offerings.delivery_mode, 'location', offerings.location)
      from public.course_offerings as offerings where offerings.version_id = p_version_id
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
      from public.offering_sessions as sessions where sessions.version_id = p_version_id
    ), '[]'::jsonb),
    'learningOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object('position', outcomes.position, 'body', outcomes.body)
        order by outcomes.position)
      from public.course_learning_outcomes as outcomes where outcomes.version_id = p_version_id
    ), '[]'::jsonb),
    'assessmentItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', items.position, 'title', items.title, 'weight', items.weight,
        'hurdle', items.hurdle, 'dueText', items.due_text, 'sourceText', items.source_text
      ) order by items.position)
      from public.course_assessment_items as items where items.version_id = p_version_id
    ), '[]'::jsonb),
    'assessmentOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assessmentPosition', items.position, 'learningOutcomePosition', outcomes.position
      ) order by items.position, outcomes.position)
      from public.course_assessment_outcomes as links
      join public.course_assessment_items as items on items.id = links.assessment_item_id
      join public.course_learning_outcomes as outcomes on outcomes.id = links.learning_outcome_id
      where links.version_id = p_version_id
    ), '[]'::jsonb),
    'sourceDocumentId', snapshot.source_document_id,
    'sourceUpdatedAt', snapshot.source_updated_at,
    'createdAt', snapshot.created_at,
    'sealedAt', snapshot.sealed_at
  ) || private.requirement_projection(p_version_id)
  from selected_snapshot as snapshot;
$$;
