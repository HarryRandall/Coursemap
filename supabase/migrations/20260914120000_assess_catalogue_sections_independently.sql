-- Assess evidence within each section; uncertainty elsewhere does not block it.
create or replace function public.catalogue_review_state(p_kind text, p_year_id bigint, p_snapshot_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb; allowed boolean; current_id bigint;
begin
  allowed := (select private.has_permission(case when p_kind = 'course' then 'courses.write' else 'catalogue.write' end))
    or (select private.has_permission('imports.manage'));
  if auth.uid() is null or not allowed then
    raise exception 'Catalogue review permission is required.' using errcode = '42501';
  end if;
  if p_kind = 'course' then
    if not exists (select 1 from public.course_snapshots where id = p_snapshot_id and course_year_id = p_year_id) then
      raise exception 'The version does not belong to this record.';
    end if;
    select coalesce(draft_snapshot_id, published_snapshot_id) into current_id from public.course_years where id = p_year_id;
  else
    if not exists (select 1 from public.academic_structure_snapshots s join public.academic_structure_years y on y.id = s.structure_year_id
      join public.academic_structures a on a.id = y.structure_id where s.id = p_snapshot_id and y.id = p_year_id and a.kind = p_kind) then
      raise exception 'The version does not belong to this record.';
    end if;
    select coalesce(draft_snapshot_id, published_snapshot_id) into current_id from public.academic_structure_years where id = p_year_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', sections.section_key,
    'approved', coalesce(last_review.approved and last_review.content_hash = sections.content_hash, false),
    'method', last_review.method,
    'reviewedAt', last_review.created_at,
    'reason', case when sections.section_key in ('requisites', 'requirements') then 'Requirements need manual review'
      when p_kind = 'course' and exists (select 1 from public.course_snapshot_field_evidence e where e.course_snapshot_id = p_snapshot_id and e.confidence_band <> 'high' and sections.content_value ? e.field_key)
        then 'Lower confidence: check source evidence'
      else 'Some fields need source verification' end,
    'eligible', sections.section_key not in ('requisites', 'requirements') and current_id = p_snapshot_id
      and case when p_kind = 'course' then
        not exists (select 1 from jsonb_each(case when sections.section_key = 'details' then sections.content_value->'snapshot' else sections.content_value end) field where field.value not in ('null'::jsonb, '[]'::jsonb, '""'::jsonb)
          and not exists (select 1 from public.course_snapshot_field_evidence e where e.course_snapshot_id = p_snapshot_id
            and regexp_replace(lower(e.field_key), '[^a-z0-9]', '', 'g') = lower(case field.key when 'units' then 'unitValue' when 'minimumUnits' then 'unitValue' when 'maximumUnits' then 'unitValue' when 'unitValueKind' then 'unitValue' when 'unitOptions' then 'unitValue' when 'level' then 'code' when 'subjectCode' then 'code' when 'offeringSessions' then 'offerings' when 'courseOffering' then 'offerings' when 'offeringStatus' then 'offerings' when 'assessmentOutcomes' then 'assessmentItems' else field.key end)
            and e.verification_status in ('source_matched', 'deterministic') and e.confidence_band = 'high' and nullif(btrim(e.evidence_excerpt), '') is not null))
        and exists (select 1 from public.course_snapshot_field_evidence e where e.course_snapshot_id = p_snapshot_id
          and e.verification_status in ('source_matched', 'deterministic') and nullif(btrim(e.evidence_excerpt), '') is not null)
        and not exists (select 1 from public.course_review_items where course_snapshot_id = p_snapshot_id and status = 'open' and issue_code <> 'MANUAL_REVIEW_REQUIRED')
      else
        not exists (select 1 from jsonb_each(case when sections.section_key = 'details' then sections.content_value->'snapshot' else sections.content_value end) field where field.value not in ('null'::jsonb, '[]'::jsonb, '""'::jsonb)
          and not exists (select 1 from public.academic_structure_snapshot_evidence e where e.snapshot_id = p_snapshot_id
            and regexp_replace(lower(e.field_key), '[^a-z0-9]', '', 'g') = lower(case field.key when 'name' then 'title' else field.key end) and e.method = 'deterministic' and e.confidence >= 0.95))
        and exists (select 1 from public.academic_structure_snapshot_evidence e where e.snapshot_id = p_snapshot_id and e.method = 'deterministic')
        and not exists (select 1 from public.academic_structure_review_items where snapshot_id = p_snapshot_id and status = 'open' and item_kind <> 'manual_review')
      end
  ) order by sections.section_key), '[]'::jsonb) into result
  from private.catalogue_review_sections(p_kind, p_snapshot_id) sections
  left join lateral (
    select r.* from public.catalogue_section_reviews r
    where (case when p_kind = 'course' then r.course_year_id = p_year_id else r.structure_year_id = p_year_id end)
      and r.section_key = sections.section_key
    order by r.created_at desc, r.id desc limit 1
  ) last_review on true;
  select coalesce(jsonb_agg(item || jsonb_build_object('reason', case
    when (item->>'eligible')::boolean then 'Source evidence verified'
    else item->>'reason' end)), '[]'::jsonb) into result from jsonb_array_elements(result) item;
  return result;
end;
$$;
revoke all on function public.catalogue_review_state(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.catalogue_review_state(text, bigint, bigint) to authenticated;
