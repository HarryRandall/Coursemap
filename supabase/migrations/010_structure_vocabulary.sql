-- Structures are described by meaning rather than by the ANU page's layout.
-- Their information sections use nine fixed keys, and related records carry
-- one of three meanings. A structure that must be taken alongside another is
-- now part of the requirement tree, so no relationship expresses it.
--
-- Stored versions are sealed and older ones still hold the retired values.
-- The constraints are added NOT VALID: they bind every new row while leaving
-- those versions as they were; the application no longer reads the retired
-- values.

alter table public.academic_structure_snapshot_sections
  add constraint academic_structure_snapshot_sections_key_check check (
    section_key = any (array[
      'study_options'::text,
      'admission'::text,
      'careers'::text,
      'first_year_advice'::text,
      'advice'::text,
      'inherent_requirements'::text,
      'fees_and_scholarships'::text,
      'further_information'::text,
      'contacts'::text
    ])
  ) not valid;

alter table public.academic_structure_snapshot_relationships
  drop constraint academic_structure_snapshot_relationships_kind_check,
  add constraint academic_structure_snapshot_relationships_kind_check check (
    relationship_kind = any (array[
      'offered_in'::text,
      'option'::text,
      'incompatible'::text
    ])
  ) not valid,
  drop constraint academic_structure_snapshot_relationships_target_kind_check,
  add constraint academic_structure_snapshot_relationships_target_kind_check check (
    target_kind = any (array[
      'programme'::text,
      'major'::text,
      'minor'::text,
      'specialisation'::text
    ])
  ) not valid;

-- A programme offers the majors, minors and specialisations it lists as
-- options or names in a structure list of its requirements.
create or replace function private.programme_offers_structure(p_programme_snapshot_id bigint, p_structure_kind text, p_structure_code text) returns boolean
    language sql stable
    set search_path to ''
    as $$
  select exists (
    select 1
    from public.academic_structure_snapshot_relationships as relationships
    where relationships.version_id = p_programme_snapshot_id
      and relationships.relationship_kind = 'option'
      and relationships.target_kind = p_structure_kind
      and relationships.target_code = p_structure_code
  ) or exists (
    select 1
    from public.requirement_condition_options as options
    join public.requirement_conditions as conditions on conditions.id = options.condition_id
    where options.version_id = p_programme_snapshot_id
      and conditions.condition_kind = 'structure_set'
      and options.kind = p_structure_kind
      and options.code = p_structure_code
  ) or exists (
    select 1
    from public.requirement_conditions as conditions
    join public.catalogue_codes as items on items.id = conditions.code_id
    where conditions.version_id = p_programme_snapshot_id
      and conditions.condition_kind = 'structure'
      and items.kind = p_structure_kind
      and items.code = p_structure_code
  );
$$;
