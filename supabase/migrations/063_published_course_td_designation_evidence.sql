-- Historical attempts need an exact-year public oracle, not a planning fallback.
create function private.sanitised_td_designation_evidence(
  p_code text, p_year smallint, p_locator text, p_excerpt text
) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  fact jsonb;
  membership jsonb;
  proof jsonb;
  parameter text;
  parameter_key text;
  parameter_value text;
  seen_keys text[] := array[]::text[];
  hash_key text;
  endpoint constant text := 'https://programsandcourses.anu.edu.au/data/CourseSearch/GetCourses?';
  designation constant text := 'Transdisciplinary Problem-Solving';
begin
  if p_code is null or p_year is null or p_code !~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'
    or p_year < 2000 or p_year > 2200
    or p_locator is null or length(p_locator) > 8192
    or p_excerpt is null or octet_length(p_excerpt) > 65536
    or left(p_locator, length(endpoint)) <> endpoint or position('#' in p_locator) > 0 then
    return null;
  end if;
  foreach parameter in array string_to_array(substr(p_locator, length(endpoint) + 1), '&') loop
    parameter_key := regexp_replace(regexp_replace(split_part(parameter, '=', 1), '%5[bB]', '[', 'g'), '%5[dD]', ']', 'g');
    parameter_value := substr(parameter, length(split_part(parameter, '=', 1)) + 2);
    if parameter_key = any(seen_keys) or position('=' in parameter) = 0 then return null; end if;
    seen_keys := array_append(seen_keys, parameter_key);
    if parameter_key = 'SelectedYear' then
      if parameter_value <> p_year::text then return null; end if;
    elsif parameter_key = 'GraduateAttributes[2]' then
      if parameter_value not in ('Transdisciplinary+Problem-Solving', 'Transdisciplinary%20Problem-Solving', designation) then return null; end if;
    elsif parameter_key in ('ShowAll') then
      if parameter_value <> 'True' then return null; end if;
    elsif parameter_key = 'PageIndex' then
      if parameter_value <> '0' then return null; end if;
    elsif parameter_key = 'PageSize' then
      if parameter_value <> 'Infinity' then return null; end if;
    elsif parameter_key = 'MaxPageSize' then
      if parameter_value <> '10' then return null; end if;
    elsif parameter_key = 'InitailSearchRequestedFromExternalPage' then
      if parameter_value <> 'false' then return null; end if;
    elsif parameter_key = 'ModeOfDelivery' then
      if parameter_value not in ('All+Modes', 'All%20Modes', 'All Modes') then return null; end if;
    elsif parameter_key = 'AppliedFilter' then
      if parameter_value <> 'FilterByCourses' then return null; end if;
    elsif parameter_key in ('Source', 'SortColumn', 'SortDirection', 'SearchText', 'CollegeName',
      'FilterByMajors', 'FilterByMinors', 'FilterBySpecialisations', 'GraduateAttributes[0]',
      'GraduateAttributes[1]', 'Careers[0]', 'Careers[1]', 'Careers[2]', 'Careers[3]',
      'Sessions[0]', 'Sessions[1]', 'Sessions[2]', 'Sessions[3]', 'Sessions[4]', 'Sessions[5]',
      'DegreeIdentifiers[0]', 'DegreeIdentifiers[1]', 'DegreeIdentifiers[2]') then
      if parameter_value <> '' then return null; end if;
    else
      return null;
    end if;
  end loop;
  if not ('SelectedYear' = any(seen_keys) and 'GraduateAttributes[2]' = any(seen_keys)) then return null; end if;
  begin
    fact := p_excerpt::jsonb;
    if jsonb_typeof(fact) <> 'object' then return null; end if;
    membership := case when jsonb_typeof(fact->'sourceExcerpt') = 'string'
      then (fact->>'sourceExcerpt')::jsonb else fact->'sourceExcerpt' end;
  exception when invalid_text_representation or untranslatable_character
    or character_not_in_repertoire or numeric_value_out_of_range
    or program_limit_exceeded then return null;
  end;
  foreach hash_key in array array['sourceHash', 'planHash'] loop
    if jsonb_typeof(fact->hash_key) is distinct from 'string'
      or fact->>hash_key !~ '^[a-f0-9]{64}$' then return null; end if;
  end loop;
  if jsonb_typeof(fact->'retrievedAt') is distinct from 'string'
    or length(fact->>'retrievedAt') > 64
    or fact->>'retrievedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then return null; end if;
  begin
    perform (fact->>'retrievedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then return null;
  end;
  proof := jsonb_build_object('repair', fact->>'repair', 'sourceHash', fact->>'sourceHash',
    'planHash', fact->>'planHash', 'retrievedAt', fact->>'retrievedAt');
  if fact->>'repair' = 'Canonical ANU transdisciplinary designation' then
    if jsonb_typeof(membership) is distinct from 'object'
      or membership->>'code' is distinct from p_code
      or membership->'year' is distinct from to_jsonb(p_year)
      or membership->>'designation' is distinct from designation then return null; end if;
    proof := proof || jsonb_build_object('sourceExcerpt', jsonb_build_object(
      'code', p_code, 'year', p_year, 'designation', designation));
  elsif fact->>'repair' = 'Canonical ANU transdisciplinary tag on a separately guarded legacy version' then
    if fact->>'code' is distinct from p_code or fact->'year' is distinct from to_jsonb(p_year) then return null; end if;
    proof := proof || jsonb_build_object('code', p_code, 'year', p_year);
    foreach hash_key in array array['exactStoredLegacyHash', 'exactReconstructedBeforeHash', 'sourceProposalHash', 'fullRawSnapshotSha256'] loop
      if jsonb_typeof(fact->hash_key) is distinct from 'string'
        or fact->>hash_key !~ '^[a-f0-9]{64}$' then return null; end if;
      proof := proof || jsonb_build_object(hash_key, fact->>hash_key);
    end loop;
  else
    return null;
  end if;
  return jsonb_build_object('field_path', 'course.tags', 'method', 'deterministic',
    'confidence', 1, 'source_locator', endpoint || 'SelectedYear=' || p_year::text ||
      '&GraduateAttributes%5B2%5D=Transdisciplinary+Problem-Solving', 'source_excerpt', proof::text);
end;
$$;
revoke all on function private.sanitised_td_designation_evidence(text, smallint, text, text) from public, anon, authenticated, service_role;

create function public.published_course_td_designation_evidence(p_selections jsonb)
returns table (
  record_id bigint,
  snapshot_id bigint,
  code text,
  academic_year smallint,
  tags text[],
  provenance jsonb
)
language sql stable security definer set search_path = '' as $$
  with bounded as materialized (
    select case when jsonb_typeof(p_selections) = 'array' then
      case when jsonb_array_length(p_selections) <= 200 then p_selections else '[]'::jsonb end
      else '[]'::jsonb end as selections
  ), normalised as materialized (
    select upper(btrim(item->>'code')) as selected_code,
      case when jsonb_typeof(item->'year') = 'number'
        and item->>'year' ~ '^(20[0-9]{2}|21[0-9]{2}|2200)$'
        then (item->>'year')::smallint end as selected_year
    from bounded cross join lateral jsonb_array_elements(bounded.selections) as item
    where jsonb_typeof(item) = 'object' and jsonb_typeof(item->'code') = 'string'
  ), selections as materialized (
    select distinct selected_code, selected_year from normalised
    where selected_code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$' and selected_year is not null
  )
  select records.id, versions.id, codes.code, years.year,
    coalesce(tag_rows.tags, array[]::text[]),
    coalesce(evidence_rows.provenance, '[]'::jsonb)
  from selections
  join public.academic_years as years on years.year = selections.selected_year
  join public.catalogue_codes as codes on codes.kind = 'course' and codes.code = selections.selected_code
  join public.catalogue_records as records on records.code_id = codes.id
    and records.academic_year_id = years.id and records.kind = 'course'
    and records.archived_at is null
  join public.catalogue_versions as versions on versions.id = records.published_version_id
    and versions.record_id = records.id and versions.academic_year_id = years.id
    and versions.kind = 'course' and versions.sealed_at is not null
  left join lateral (
    select array_agg(course_tags.name order by course_tags.position, course_tags.id) as tags
    from public.course_tags where course_tags.version_id = versions.id
  ) as tag_rows on true
  left join lateral (
    select jsonb_agg(sanitised.proof order by evidence.id) filter (where sanitised.proof is not null) as provenance
    -- Clones preserve created_at; id breaks ties between facts from one import.
    -- A newer tag edit supersedes older authority even when it cannot be verified.
    from (
      select facts.id, facts.method, facts.confidence, facts.source_locator, facts.source_excerpt
      from public.catalogue_version_provenance as facts
      where facts.version_id = versions.id and facts.field_path = 'course.tags'
      order by facts.created_at desc, facts.id desc
      limit 1
    ) as evidence
    cross join lateral (select private.sanitised_td_designation_evidence(
      codes.code, years.year, evidence.source_locator, evidence.source_excerpt
    ) as proof) as sanitised
    where evidence.method = 'deterministic' and evidence.confidence = 1
  ) as evidence_rows on true
  order by years.year, codes.code;
$$;

comment on function public.published_course_td_designation_evidence(jsonb) is
  'Bounded exact-year published course tags and deterministic tag evidence only; no historical, draft or private source-document projection.';
revoke all on function public.published_course_td_designation_evidence(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.published_course_td_designation_evidence(jsonb) to anon, authenticated, service_role;
