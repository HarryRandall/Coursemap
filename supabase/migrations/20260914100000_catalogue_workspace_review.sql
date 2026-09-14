-- Annual workspace UUIDs exist before extraction; numeric keys remain internal.
alter table public.course_years add column public_id uuid not null default gen_random_uuid() unique;
alter table public.academic_structure_years add column public_id uuid not null default gen_random_uuid() unique;
insert into public.courses(code)
select distinct code from public.course_directory_entries
on conflict (code) do nothing;
insert into public.academic_structures(code, kind)
select distinct code, structure_kind from public.academic_structure_directory_entries
on conflict (code) do nothing;

insert into public.course_years(course_id, academic_year_id)
select c.id, d.academic_year_id from public.course_directory_entries d join public.courses c using(code)
on conflict (course_id, academic_year_id) do nothing;
insert into public.academic_structure_years(structure_id, academic_year_id)
select s.id, d.academic_year_id from public.academic_structure_directory_entries d join public.academic_structures s on s.code = d.code and s.kind = d.structure_kind
on conflict (structure_id, academic_year_id) do nothing;

create function private.ensure_catalogue_directory_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'course_directory_entries' then
    insert into public.courses(code) values (new.code) on conflict (code) do nothing;
    insert into public.course_years(course_id, academic_year_id)
    select id, new.academic_year_id from public.courses where code = new.code
    on conflict (course_id, academic_year_id) do nothing;
  else
    insert into public.academic_structures(code, kind) values (new.code, new.structure_kind)
    on conflict (code) do nothing;
    insert into public.academic_structure_years(structure_id, academic_year_id)
    select id, new.academic_year_id from public.academic_structures where code = new.code and kind = new.structure_kind
    on conflict (structure_id, academic_year_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_catalogue_directory_identity() from public, anon, authenticated;
create trigger course_directory_identity after insert on public.course_directory_entries
for each row execute function private.ensure_catalogue_directory_identity();
create trigger structure_directory_identity after insert on public.academic_structure_directory_entries
for each row execute function private.ensure_catalogue_directory_identity();

alter table public.course_snapshots add column public_id uuid not null default gen_random_uuid() unique;
alter table public.academic_structure_snapshots add column public_id uuid not null default gen_random_uuid() unique;

create table public.catalogue_section_reviews (
  id uuid primary key default gen_random_uuid(),
  course_year_id bigint references public.course_years(id),
  structure_year_id bigint references public.academic_structure_years(id),
  section_key text not null,
  version_id uuid,
  content_hash text not null,
  approved boolean not null,
  method text not null check (method in ('manual', 'bulk', 'content_changed', 'published')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint catalogue_section_reviews_one_owner check (num_nonnulls(course_year_id, structure_year_id) = 1)
);
create index catalogue_section_reviews_course on public.catalogue_section_reviews(course_year_id, section_key, created_at desc);
create index catalogue_section_reviews_structure on public.catalogue_section_reviews(structure_year_id, section_key, created_at desc);
alter table public.catalogue_section_reviews enable row level security;
create policy catalogue_section_reviews_read on public.catalogue_section_reviews for select to authenticated
using ((select private.has_permission('courses.write')) or (select private.has_permission('catalogue.write')) or (select private.has_permission('imports.manage')));
grant select on public.catalogue_section_reviews to authenticated;

-- Ignore extraction bookkeeping when deciding whether reviewed content changed.
create function private.catalogue_review_content(value jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare result jsonb;
begin
  if jsonb_typeof(value) = 'object' then
    select coalesce(jsonb_object_agg(key, private.catalogue_review_content(child)), '{}'::jsonb) into result
    from jsonb_each(value) as fields(key, child)
    where key not in ('sourceUpdatedAt', 'sourceLocator', 'evidence', 'overallConfidence', 'projectionSha256', 'schemaVersion');
    return result;
  elsif jsonb_typeof(value) = 'array' then
    select coalesce(jsonb_agg(private.catalogue_review_content(child) order by position), '[]'::jsonb) into result
    from jsonb_array_elements(value) with ordinality as items(child, position);
    return result;
  end if;
  return value;
end;
$$;
revoke all on function private.catalogue_review_content(jsonb) from public, anon, authenticated;

create function private.catalogue_review_sections(p_kind text, p_snapshot_id bigint)
returns table(section_key text, content_hash text, content_value jsonb) language plpgsql stable set search_path = '' as $$
declare projection jsonb; definitions jsonb; section record; values jsonb; field text;
begin
  if p_kind = 'course' then
    projection := private.course_snapshot_projection(p_snapshot_id);
    definitions := '{"overview": ["title", "subjectCode", "subjectName", "level", "academicCareer", "school", "college", "introduction", "description"], "teaching": ["convenerText", "deliverySummary", "workloadText", "workloadHours", "inherentRequirements", "prescribedTexts"], "units": ["unitValueKind", "units", "minimumUnits", "maximumUnits", "eftsl", "offeringStatus", "unitOptions"], "outcomes": ["learningOutcomes", "assessmentOutcomes"], "assessment": ["assessmentItems", "assessmentOutcomes"], "attributes": ["attributes"], "areas": ["areasOfInterest"], "offerings": ["offeringSessions", "courseOffering"], "fees": ["fees"], "related": ["relatedCourses"], "requisites": ["rules", "ruleGroups", "ruleConditions", "ruleConditionCourses"]}'::jsonb;
  else
    projection := private.academic_structure_manual_projection(p_snapshot_id);
    definitions := '{"details": ["snapshot"], "summary": ["summaryFields"], "sections": ["sections"], "outcomes": ["learningOutcomes"], "fees": ["fees"], "relationships": ["relationships"], "requirements": ["requirementRootKey", "requirementGroups", "requirementConditions", "requirementOptions", "unmodelledRequirements"]}'::jsonb;
  end if;
  for section in select * from jsonb_each(definitions) loop
    values := '{}'::jsonb;
    for field in select jsonb_array_elements_text(section.value) loop
      values := values || jsonb_build_object(field, coalesce(projection->field, projection->'snapshot'->field, 'null'::jsonb));
    end loop;
    section_key := section.key;
    content_value := private.catalogue_review_content(values);
    content_hash := encode(extensions.digest(convert_to(content_value::text, 'UTF8'), 'sha256'), 'hex');
    return next;
  end loop;
end;
$$;
revoke all on function private.catalogue_review_sections(text, bigint) from public, anon, authenticated;

create function public.catalogue_review_state(p_kind text, p_year_id bigint, p_snapshot_id bigint)
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
    'eligible', sections.section_key not in ('requisites', 'requirements') and current_id = p_snapshot_id
      and case when p_kind = 'course' then
        not exists (select 1 from jsonb_each(sections.content_value) field where field.value not in ('null'::jsonb, '[]'::jsonb, '""'::jsonb)
          and not exists (select 1 from public.course_snapshot_field_evidence e where e.course_snapshot_id = p_snapshot_id
            and regexp_replace(lower(e.field_key), '[^a-z0-9]', '', 'g') = lower(field.key)
            and e.verification_status in ('source_matched', 'deterministic') and nullif(btrim(e.evidence_excerpt), '') is not null))
        and exists (select 1 from public.course_snapshot_field_evidence e where e.course_snapshot_id = p_snapshot_id
          and e.verification_status in ('source_matched', 'deterministic') and nullif(btrim(e.evidence_excerpt), '') is not null)
        and not exists (select 1 from public.course_snapshot_field_evidence e where e.course_snapshot_id = p_snapshot_id
          and (e.verification_status not in ('source_matched', 'deterministic') or e.confidence_band <> 'high'))
        and not exists (select 1 from public.course_review_items where course_snapshot_id = p_snapshot_id and status = 'open' and issue_code <> 'MANUAL_REVIEW_REQUIRED')
      else
        not exists (select 1 from jsonb_each(sections.content_value) field where field.value not in ('null'::jsonb, '[]'::jsonb, '""'::jsonb)
          and not exists (select 1 from public.academic_structure_snapshot_evidence e where e.snapshot_id = p_snapshot_id
            and regexp_replace(lower(e.field_key), '[^a-z0-9]', '', 'g') = lower(field.key) and e.method = 'deterministic'))
        and exists (select 1 from public.academic_structure_snapshot_evidence e where e.snapshot_id = p_snapshot_id and e.method = 'deterministic')
        and not exists (select 1 from public.academic_structure_snapshot_evidence e where e.snapshot_id = p_snapshot_id and (e.method <> 'deterministic' or e.confidence < 0.95))
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
  return result;
end;
$$;
revoke all on function public.catalogue_review_state(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.catalogue_review_state(text, bigint, bigint) to authenticated;

create function public.review_catalogue_sections(p_kind text, p_year_id bigint, p_snapshot_id bigint, p_sections text[], p_approved boolean, p_bulk boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare state jsonb; current_id bigint; section record; ids uuid[]; proposal_id uuid;
begin
  if auth.uid() is null or not private.has_permission(case when p_kind = 'course' then 'courses.write' else 'catalogue.write' end) then
    raise exception 'Catalogue write permission is required.' using errcode = '42501';
  end if;
  -- Match the import worker's lock order before taking the year lock.
  if p_kind = 'course' then
    perform id from public.course_import_runs where id in (select run_id from public.course_import_targets where course_year_id = p_year_id) order by id for update;
    perform id from public.course_import_targets where course_year_id = p_year_id order by id for update;
    select draft_snapshot_id into current_id from public.course_years where id = p_year_id for update;
  else
    perform id from public.academic_structure_import_runs where id in (select run_id from public.academic_structure_import_targets where structure_year_id = p_year_id) order by id for update;
    perform id from public.academic_structure_import_targets where structure_year_id = p_year_id order by id for update;
    select draft_snapshot_id into current_id from public.academic_structure_years where id = p_year_id for update;
  end if;
  if current_id is distinct from p_snapshot_id then
    raise exception 'The working content changed. Refresh before approving.' using errcode = '40001';
  end if;
  state := public.catalogue_review_state(p_kind, p_year_id, p_snapshot_id);
  if exists (select 1 from unnest(p_sections) k where not exists (select 1 from jsonb_array_elements(state) s where s->>'key' = k)) then
    raise exception 'Choose valid review sections.';
  end if;
  for section in select * from private.catalogue_review_sections(p_kind, p_snapshot_id) where section_key = any(p_sections) loop
    if p_bulk and not exists (select 1 from jsonb_array_elements(state) s where s->>'key' = section.section_key and (s->>'eligible')::boolean) then
      raise exception 'This section needs manual review.';
    end if;
    insert into public.catalogue_section_reviews(course_year_id, structure_year_id, section_key, content_hash, approved, method, actor_id, version_id)
    values (case when p_kind = 'course' then p_year_id end, case when p_kind <> 'course' then p_year_id end,
      section.section_key, section.content_hash, p_approved, case when p_bulk then 'bulk' else 'manual' end, auth.uid(), case when p_kind = 'course' then (select public_id from public.course_snapshots where id = p_snapshot_id) else (select public_id from public.academic_structure_snapshots where id = p_snapshot_id) end);
  end loop;
  state := public.catalogue_review_state(p_kind, p_year_id, p_snapshot_id);
  if not exists (select 1 from jsonb_array_elements(state) s where not (s->>'approved')::boolean) then
    if p_kind = 'course' then
      with recursive ancestry as (
        select id, based_on_snapshot_id from public.course_snapshots where id = p_snapshot_id
        union select s.id, s.based_on_snapshot_id from public.course_snapshots s join ancestry a on a.based_on_snapshot_id = s.id
      ) select coalesce(array_agg(r.id), '{}'::uuid[]) into ids from public.course_review_items r join ancestry a on a.id = r.course_snapshot_id where r.status = 'open' and r.is_blocking;
      if cardinality(ids) > 0 or exists (select 1 from public.course_snapshots where id = p_snapshot_id and has_critical_uncertainty) then
        perform public.confirm_course_manual_snapshot(p_year_id, p_snapshot_id, private.course_snapshot_projection(p_snapshot_id), ids,
          'All sections reviewed. Manual approvals acknowledge the displayed source warnings; eligible sections approved using verified source evidence.');
      end if;
    else
      with recursive ancestry as (
        select id, parent_snapshot_id from public.academic_structure_snapshots where id = p_snapshot_id
        union select s.id, s.parent_snapshot_id from public.academic_structure_snapshots s join ancestry a on a.parent_snapshot_id = s.id
      ) select t.id into proposal_id from public.academic_structure_import_targets t join ancestry a on a.id = t.candidate_snapshot_id
      where t.structure_year_id = p_year_id and t.review_status = 'needs_review' order by t.created_at desc limit 1;
      if proposal_id is not null then
        perform public.review_academic_structure_import_target(proposal_id, 'accepted', 'All sections reviewed and source warnings acknowledged.');
      end if;
    end if;
  end if;
  return state;
end;
$$;
revoke all on function public.review_catalogue_sections(text, bigint, bigint, text[], boolean, boolean) from public, anon, authenticated;
grant execute on function public.review_catalogue_sections(text, bigint, bigint, text[], boolean, boolean) to authenticated;

create function private.catalogue_review_pointer_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare kind text; section record; previous_hash text; state jsonb;
begin
  if tg_table_name = 'course_years' then kind := 'course';
  else select a.kind into kind from public.academic_structures a where a.id = new.structure_id; end if;
  if new.draft_snapshot_id is distinct from old.draft_snapshot_id and new.draft_snapshot_id is not null then
    for section in select * from private.catalogue_review_sections(kind, new.draft_snapshot_id) loop
      select content_hash into previous_hash from private.catalogue_review_sections(kind, old.draft_snapshot_id) where section_key = section.section_key;
      if previous_hash is distinct from section.content_hash then
        insert into public.catalogue_section_reviews(course_year_id, structure_year_id, section_key, content_hash, approved, method, actor_id, version_id)
        values (case when kind = 'course' then new.id end, case when kind <> 'course' then new.id end,
          section.section_key, section.content_hash, false, 'content_changed', auth.uid(), case when kind = 'course' then (select public_id from public.course_snapshots where id = new.draft_snapshot_id) else (select public_id from public.academic_structure_snapshots where id = new.draft_snapshot_id) end);
      end if;
    end loop;
  end if;
  if new.published_snapshot_id is distinct from old.published_snapshot_id and new.published_snapshot_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('approved', coalesce(r.approved and r.content_hash = s.content_hash, false))), '[]'::jsonb) into state
    from private.catalogue_review_sections(kind, new.published_snapshot_id) s left join lateral (
      select reviews.* from public.catalogue_section_reviews reviews
      where (case when kind = 'course' then reviews.course_year_id = new.id else reviews.structure_year_id = new.id end)
        and reviews.section_key = s.section_key order by reviews.created_at desc, reviews.id desc limit 1
    ) r on true;
    if exists (select 1 from jsonb_array_elements(state) s where not (s->>'approved')::boolean) then
      raise exception 'Approve every required section before publishing.' using errcode = '55000';
    end if;
    insert into public.catalogue_section_reviews(course_year_id, structure_year_id, section_key, content_hash, approved, method, actor_id, version_id)
    values (case when kind = 'course' then new.id end, case when kind <> 'course' then new.id end, '$publication', '', true, 'published', auth.uid(),
      case when kind = 'course' then (select public_id from public.course_snapshots where id = new.published_snapshot_id) else (select public_id from public.academic_structure_snapshots where id = new.published_snapshot_id) end);
  end if;
  return new;
end;
$$;
revoke all on function private.catalogue_review_pointer_guard() from public, anon, authenticated;
create trigger course_year_review_guard before update of draft_snapshot_id, published_snapshot_id on public.course_years
for each row execute function private.catalogue_review_pointer_guard();
create trigger structure_year_review_guard before update of draft_snapshot_id, published_snapshot_id on public.academic_structure_years
for each row execute function private.catalogue_review_pointer_guard();

create function public.catalogue_import_comparison(p_kind text, p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare year_id bigint; candidate_id bigint; current_id bigint; before_value jsonb; after_value jsonb; issues jsonb;
begin
  if auth.uid() is null or not private.has_permission('imports.manage') then
    raise exception 'Import permission is required.' using errcode = '42501';
  end if;
  if p_kind = 'course' then
    select course_year_id, candidate_snapshot_id into year_id, candidate_id from public.course_import_targets where id = p_target_id;
    select coalesce(draft_snapshot_id, published_snapshot_id) into current_id from public.course_years where id = year_id;
    before_value := private.course_snapshot_projection(current_id);
    after_value := private.course_snapshot_projection(candidate_id);
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'message', summary, 'sourceText', source_excerpt, 'values', new_value)), '[]'::jsonb) into issues
      from public.course_review_items where target_id = p_target_id and status = 'open' and issue_code <> 'MANUAL_REVIEW_REQUIRED';
  else
    select structure_year_id, candidate_snapshot_id into year_id, candidate_id from public.academic_structure_import_targets where id = p_target_id and structure_kind = p_kind;
    select coalesce(draft_snapshot_id, published_snapshot_id) into current_id from public.academic_structure_years where id = year_id;
    before_value := private.academic_structure_manual_projection(current_id);
    after_value := private.academic_structure_manual_projection(candidate_id);
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'message', message, 'sourceText', source_text, 'values', null)), '[]'::jsonb) into issues
      from public.academic_structure_review_items where target_id = p_target_id and status = 'open' and item_kind <> 'manual_review';
  end if;
  if candidate_id is null or after_value is null then raise exception 'The imported content is unavailable.'; end if;
  return jsonb_build_object('currentSnapshotId', current_id, 'before', before_value, 'after', after_value, 'issues', issues);
end;
$$;
revoke all on function public.catalogue_import_comparison(text, uuid) from public, anon, authenticated;
grant execute on function public.catalogue_import_comparison(text, uuid) to authenticated;

create function public.apply_catalogue_import_changes(p_kind text, p_target_id uuid, p_expected_snapshot_id bigint, p_fields text[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare year_id bigint; candidate_id bigint; run_id uuid; current_id bigint; current_published bigint; baseline_published bigint;
  comparison jsonb; merged jsonb; imported jsonb; field text; saved_id bigint;
begin
  if auth.uid() is null or not private.has_permission('imports.manage')
    or not private.has_permission(case when p_kind = 'course' then 'courses.write' else 'catalogue.write' end) then
    raise exception 'Import and catalogue write permissions are required.' using errcode = '42501';
  end if;
  if cardinality(p_fields) = 0 or p_fields is null then raise exception 'Select at least one change.'; end if;
  if p_kind = 'course' then
    select t.run_id into run_id from public.course_import_targets t where id = p_target_id;
    perform id from public.course_import_runs where id = run_id for update;
    select t.course_year_id, t.candidate_snapshot_id, t.baseline_published_snapshot_id into year_id, candidate_id, baseline_published
      from public.course_import_targets t where id = p_target_id and processing_status = 'ready_for_review' and review_status = 'pending' for update;
    select coalesce(draft_snapshot_id, published_snapshot_id), published_snapshot_id into current_id, current_published from public.course_years where id = year_id for update;
  else
    select t.run_id into run_id from public.academic_structure_import_targets t where id = p_target_id;
    perform id from public.academic_structure_import_runs where id = run_id for update;
    select t.structure_year_id, t.candidate_snapshot_id, t.baseline_published_snapshot_id into year_id, candidate_id, baseline_published
      from public.academic_structure_import_targets t where id = p_target_id and structure_kind = p_kind and processing_status = 'succeeded' and review_status = 'needs_review' for update;
    select coalesce(draft_snapshot_id, published_snapshot_id), published_snapshot_id into current_id, current_published from public.academic_structure_years where id = year_id for update;
  end if;
  if candidate_id is null then raise exception 'This import is no longer awaiting a decision.'; end if;
  if current_id is distinct from p_expected_snapshot_id or current_published is distinct from baseline_published then
    raise exception 'The record changed. Reload the comparison before applying changes.' using errcode = '40001';
  end if;
  comparison := public.catalogue_import_comparison(p_kind, p_target_id);
  merged := comparison->'before'; imported := comparison->'after';
  foreach field in array p_fields loop
    if field in ('schemaVersion', 'courseCode', 'structureCode', 'structureKind', 'academicYear', 'snapshot', 'evidence', 'projectionSha256') then
      raise exception 'This field cannot be replaced.';
    end if;
    if imported->'snapshot' ? field then
      merged := jsonb_set(merged, array['snapshot', field], imported->'snapshot'->field);
    elsif imported ? field then
      merged := jsonb_set(merged, array[field], imported->field);
    else raise exception 'Choose a valid changed field.';
    end if;
  end loop;
  if private.catalogue_review_content(merged) = private.catalogue_review_content(comparison->'before') then
    raise exception 'No content changes were selected.';
  end if;
  if p_kind = 'course' then
    saved_id := public.create_course_manual_snapshot(year_id, current_id, merged);
    update public.course_import_targets t set review_status = 'accepted', reviewed_by = auth.uid(), reviewed_at = now(), lock_version = lock_version + 1 where id = p_target_id;
    perform private.refresh_course_import_run(run_id);
  else
    saved_id := public.create_academic_structure_manual_snapshot(year_id, current_id, merged);
    update public.academic_structure_import_targets t set review_status = 'accepted', reviewed_by = auth.uid(), reviewed_at = now() where id = p_target_id;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.apply_catalogue_import_changes(text, uuid, bigint, text[]) from public, anon, authenticated;
grant execute on function public.apply_catalogue_import_changes(text, uuid, bigint, text[]) to authenticated;

create function public.restore_catalogue_version(p_kind text, p_year_id bigint, p_version_id uuid, p_expected_snapshot_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare source_id bigint;
begin
  if auth.uid() is null or not private.has_permission(case when p_kind = 'course' then 'courses.write' else 'catalogue.write' end) then
    raise exception 'Catalogue write permission is required.' using errcode = '42501';
  end if;
  if p_kind = 'course' then
    select id into source_id from public.course_snapshots where public_id = p_version_id and course_year_id = p_year_id;
    if source_id is null then raise exception 'The version does not belong to this record.'; end if;
    return public.create_course_manual_snapshot(p_year_id, p_expected_snapshot_id, private.course_snapshot_projection(source_id));
  else
    select s.id into source_id from public.academic_structure_snapshots s join public.academic_structure_years y on y.id = s.structure_year_id
      join public.academic_structures a on a.id = y.structure_id where s.public_id = p_version_id and y.id = p_year_id and a.kind = p_kind;
    if source_id is null then raise exception 'The version does not belong to this record.'; end if;
    return public.create_academic_structure_manual_snapshot(p_year_id, p_expected_snapshot_id, private.academic_structure_manual_projection(source_id));
  end if;
end;
$$;
revoke all on function public.restore_catalogue_version(text, bigint, uuid, bigint) from public, anon, authenticated;
grant execute on function public.restore_catalogue_version(text, bigint, uuid, bigint) to authenticated;

create function public.catalogue_review_history(p_kind text, p_year_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (private.has_permission('imports.manage') or private.has_permission(case when p_kind = 'course' then 'courses.write' else 'catalogue.write' end)) then
    raise exception 'Catalogue review permission is required.' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(event order by event->>'createdAt' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', r.id, 'section', r.section_key, 'approved', r.approved, 'method', r.method,
      'actor', coalesce(p.display_name, 'Administrator'), 'createdAt', r.created_at, 'versionId', r.version_id) as event
    from public.catalogue_section_reviews r left join public.profiles p on p.id = r.actor_id
    where case when p_kind = 'course' then r.course_year_id = p_year_id else r.structure_year_id = p_year_id end
    order by r.created_at desc limit 200
  ) events);
end;
$$;
revoke all on function public.catalogue_review_history(text, bigint) from public, anon, authenticated;
grant execute on function public.catalogue_review_history(text, bigint) to authenticated;

create function public.admin_catalogue_projection(p_kind text, p_snapshot_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (private.has_permission('catalogue.read_drafts') or private.has_permission('imports.manage')) then
    raise exception 'Catalogue read permission is required.' using errcode = '42501';
  end if;
  if p_kind = 'course' then return private.course_snapshot_projection(p_snapshot_id); end if;
  return private.academic_structure_manual_projection(p_snapshot_id);
end;
$$;
revoke all on function public.admin_catalogue_projection(text, bigint) from public, anon, authenticated;
grant execute on function public.admin_catalogue_projection(text, bigint) to authenticated;
