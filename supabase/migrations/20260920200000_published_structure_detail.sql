begin;

-- Published reads existed for courses only, so a programme, major, minor or
-- specialisation had no way of reaching a reader. This adds the structure
-- equivalent of `published_course_detail`, with the same security posture:
-- the projection stays private, and the public entry point resolves through
-- `catalogue_records.published_version_id` so no draft can be reached.

create or replace function private.structure_version_projection(p_version_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with selected_snapshot as (
    select
      snapshots.id,
      snapshots.origin,
      details.*,
      items.code as structure_code,
      academic_years.year as academic_year
    from public.catalogue_versions as snapshots
    join public.structure_version_details as details on details.version_id = snapshots.id
    join public.catalogue_records as item_years on item_years.id = snapshots.record_id
    join public.catalogue_codes as items on items.id = item_years.code_id
    join public.academic_years on academic_years.id = snapshots.academic_year_id
    where snapshots.id = p_version_id
  )
  select jsonb_build_object(
    'structureCode', snapshot.structure_code,
    'structureKind', snapshot.kind,
    'academicYear', snapshot.academic_year,
    'origin', snapshot.origin,
    'snapshot', jsonb_build_object(
      'name', snapshot.name,
      'acronym', snapshot.acronym,
      'shortName', snapshot.short_name,
      'introduction', snapshot.introduction,
      'description', snapshot.description,
      'units', snapshot.units,
      'durationYears', snapshot.duration_years,
      'academicCareer', snapshot.academic_career,
      'college', snapshot.college,
      'modeOfDelivery', snapshot.mode_of_delivery,
      'selectionRank', snapshot.selection_rank,
      'atar', snapshot.atar,
      'canCombine', snapshot.can_combine,
      'canCombineVertical', snapshot.can_combine_vertical,
      'studyAs', snapshot.study_as,
      'contactText', snapshot.contact_text
    ),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', sections.position,
        'sectionKey', sections.section_key,
        'heading', sections.heading,
        'markdown', sections.markdown
      ) order by sections.position)
      from public.academic_structure_snapshot_sections as sections
      where sections.version_id = p_version_id
    ), '[]'::jsonb),
    'learningOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', outcomes.position,
        'outcomeText', outcomes.outcome_text
      ) order by outcomes.position)
      from public.academic_structure_learning_outcomes as outcomes
      where outcomes.version_id = p_version_id
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
        'sourceLabel', fees.source_label,
        'sourceText', fees.source_text
      ) order by fees.position)
      from public.academic_structure_fees as fees
      where fees.version_id = p_version_id
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', relationships.position,
        'relationshipKind', relationships.relationship_kind,
        'targetKind', relationships.target_kind,
        'targetCode', relationships.target_code,
        'targetTitle', relationships.target_title
      ) order by relationships.position)
      from public.academic_structure_snapshot_relationships as relationships
      where relationships.version_id = p_version_id
    ), '[]'::jsonb),
    'requirements', private.requirement_projection(p_version_id),
    -- Structure options store a code and nothing else, so a reader would see
    -- "COMS-MAJ" with no name. Resolve each one through its own published
    -- snapshot for the same year.
    'requirementOptionTitles', coalesce((
      select jsonb_object_agg(resolved.code, resolved.name)
      from (
        select distinct on (option_items.code)
          option_items.code,
          option_details.name
        from public.requirement_condition_options as options
        join public.catalogue_codes as option_items on option_items.id = options.code_id
        join public.catalogue_records as option_years
          on option_years.code_id = option_items.id
         and option_years.academic_year_id = (
           select snapshots.academic_year_id
           from public.catalogue_versions as snapshots
           where snapshots.id = p_version_id
         )
         and option_years.archived_at is null
        join public.structure_version_details as option_details
          on option_details.version_id = option_years.published_version_id
        where options.version_id = p_version_id
          and options.kind <> 'course'
      ) as resolved
    ), '{}'::jsonb)
  )
  from selected_snapshot as snapshot;
$function$;

revoke all on function private.structure_version_projection(bigint)
from public, anon, authenticated;

create or replace function public.published_structure_detail(
  p_structure_code text,
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
$function$;

revoke all on function public.published_structure_detail(text, smallint) from public;
grant execute on function public.published_structure_detail(text, smallint)
to anon, authenticated;

-- The published years a structure can be read in, so a page can offer another
-- year rather than reporting the code as missing.
create or replace function public.published_structure_years(p_structure_code text)
returns table (academic_year smallint, structure_kind text)
language sql
stable
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function public.published_structure_years(text) from public;
grant execute on function public.published_structure_years(text) to anon, authenticated;

commit;
