-- A course offering row anchors sessions even when no summary was supplied.
-- Null preserves the unknown representation of immutable historical versions.
alter table public.course_offerings
  add column has_summary boolean;

alter table public.course_offerings
  add constraint course_offerings_absent_summary_check
  check (has_summary is distinct from false or (delivery_mode is null and location is null));

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
      'workloadHoursBasis', snapshot.workload_hours_basis,
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
      select case when offerings.has_summary is false then null
        else jsonb_build_object('deliveryMode', offerings.delivery_mode, 'location', offerings.location) end
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
