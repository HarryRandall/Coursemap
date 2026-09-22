-- Coursemap baseline, part 3 of 8: codes, records, versions and published content
--
-- The catalogue proper. A code is an identity across years, a record is one
-- code in one year, a version is an immutable snapshot of that record's
-- content, and a publication is the version students see. Kind-specific
-- content hangs off a version in child tables, and requirements are one
-- shared tree used by course requisites and by programme, major, minor and
-- specialisation structures alike.
--
-- A version is sealed on publication and its child rows are guarded against
-- mutation, so published content cannot drift underneath a reader.

create table if not exists public.academic_structure_fees (
    id bigint not null,
    version_id bigint not null,
    position integer not null,
    fee_year smallint,
    audience text not null,
    fee_type text not null,
    amount numeric(12,2),
    currency character(3),
    basis text not null,
    source_label text,
    source_text text not null,
    source_locator text not null,
    constraint academic_structure_fees_amount_check check (((amount is null) or (amount >= (0)::numeric))),
    constraint academic_structure_fees_audience_check check ((audience = any (array['domestic'::text, 'international'::text, 'commonwealth_supported'::text, 'other'::text]))),
    constraint academic_structure_fees_basis_check check ((basis = any (array['programme'::text, 'unit'::text, 'eftsl'::text, 'annual'::text, 'unknown'::text]))),
    constraint academic_structure_fees_source_check check ((((source_label is null) or (btrim(source_label) <> ''::text)) and (btrim(source_text) <> ''::text) and (btrim(source_locator) <> ''::text))),
    constraint academic_structure_fees_type_check check ((fee_type = any (array['student_contribution'::text, 'tuition'::text, 'indicative'::text, 'other'::text]))),
    constraint academic_structure_fees_year_check check (((fee_year is null) or ((fee_year >= 2000) and (fee_year <= 2200))))
);

create table if not exists public.academic_structure_learning_outcomes (
    id bigint not null,
    version_id bigint not null,
    position integer not null,
    outcome_text text not null,
    source_text text not null,
    source_locator text not null,
    constraint academic_structure_learning_outcomes_values_check check (((btrim(outcome_text) <> ''::text) and (btrim(source_text) <> ''::text) and (btrim(source_locator) <> ''::text) and (position >= 0)))
);

create table if not exists public.academic_structure_snapshot_relationships (
    id bigint not null,
    version_id bigint not null,
    position integer not null,
    relationship_kind text not null,
    target_kind text not null,
    target_code text not null,
    target_title text,
    source_text text not null,
    source_locator text not null,
    constraint academic_structure_snapshot_relationships_code_check check ((target_code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'::text)),
    constraint academic_structure_snapshot_relationships_kind_check check ((relationship_kind = any (array['source_reference'::text, 'relevant'::text, 'option'::text, 'required'::text, 'incompatible'::text, 'other'::text]))),
    constraint academic_structure_snapshot_relationships_target_kind_check check ((target_kind = any (array['programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text, 'course'::text]))),
    constraint academic_structure_snapshot_relationships_values_check check (((btrim(source_text) <> ''::text) and (btrim(source_locator) <> ''::text) and (position >= 0)))
);

create table if not exists public.academic_structure_snapshot_sections (
    id bigint not null,
    version_id bigint not null,
    section_key text not null,
    heading text not null,
    markdown text not null,
    source_text text not null,
    source_locator text not null,
    position integer not null,
    constraint academic_structure_snapshot_sections_values_check check (((btrim(section_key) <> ''::text) and (btrim(heading) <> ''::text) and (btrim(source_text) <> ''::text) and (btrim(source_locator) <> ''::text) and (position >= 0)))
);

create table if not exists public.catalogue_codes (
    id bigint not null,
    public_id uuid default gen_random_uuid() not null,
    kind text not null,
    code text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint catalogue_codes_code_format_check check (
case kind
    when 'course'::text then (code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'::text)
    else (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'::text)
end),
    constraint catalogue_codes_kind_check check ((kind = any (array['course'::text, 'programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text])))
);

create table if not exists public.catalogue_publications (
    id bigint not null,
    record_id bigint not null,
    version_id bigint not null,
    published_by uuid,
    published_at timestamp with time zone default statement_timestamp() not null,
    unpublished_by uuid,
    unpublished_at timestamp with time zone,
    constraint catalogue_publications_interval_check check (((unpublished_at is null) or (unpublished_at >= published_at)))
);

create table if not exists public.catalogue_records (
    id bigint not null,
    public_id uuid default gen_random_uuid() not null,
    code_id bigint not null,
    kind text not null,
    academic_year_id bigint not null,
    published_version_id bigint,
    archived_at timestamp with time zone,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    latest_source_version_id bigint,
    source_checked_at timestamp with time zone
);

create table if not exists public.catalogue_sources (
    id bigint not null,
    name text not null,
    kind text not null,
    base_url text not null,
    is_active boolean default true not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint catalogue_sources_base_url_check check ((base_url ~ '^https://[^[:space:]]+$'::text)),
    constraint catalogue_sources_kind_not_blank_check check ((btrim(kind) <> ''::text)),
    constraint catalogue_sources_name_not_blank_check check ((btrim(name) <> ''::text))
);

create table if not exists public.catalogue_version_provenance (
    id bigint not null,
    version_id bigint not null,
    academic_year_id bigint not null,
    source_page_id bigint,
    field_path text not null,
    method text not null,
    confidence numeric(5,4),
    source_locator text,
    source_excerpt text,
    created_at timestamp with time zone default now() not null,
    source_document_id bigint,
    constraint catalogue_version_provenance_confidence_check check (((confidence is null) or ((confidence >= (0)::numeric) and (confidence <= (1)::numeric)))),
    constraint catalogue_version_provenance_field_path_check check ((btrim(field_path) <> ''::text)),
    constraint catalogue_version_provenance_method_check check ((method = any (array['deterministic'::text, 'model'::text, 'manual'::text])))
);

create table if not exists public.catalogue_versions (
    id bigint not null,
    public_id uuid default gen_random_uuid() not null,
    record_id bigint not null,
    kind text not null,
    academic_year_id bigint not null,
    origin text not null,
    based_on_version_id bigint,
    content_hash text not null,
    sealed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone default now() not null,
    source_document_id bigint,
    sync_id uuid,
    constraint catalogue_versions_content_hash_check check ((content_hash ~ '^[0-9a-f]{64}$'::text)),
    constraint catalogue_versions_origin_check check ((origin = any (array['source'::text, 'manual'::text]))),
    constraint catalogue_versions_sealed_at_check check (((sealed_at is null) or (sealed_at >= created_at)))
);

create table if not exists public.course_areas_of_interest (
    id bigint not null,
    version_id bigint not null,
    position integer not null,
    name text not null,
    created_at timestamp with time zone default now() not null,
    constraint course_areas_of_interest_name_not_blank_check check ((btrim(name) <> ''::text)),
    constraint course_areas_of_interest_position_check check ((position > 0))
);

create table if not exists public.course_assessment_items (
    id bigint not null,
    position integer not null,
    title text not null,
    weight numeric(5,2),
    learning_outcomes smallint[],
    source_text text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    version_id bigint not null,
    hurdle boolean,
    due_text text,
    constraint course_assessment_items_due_text_check check (((due_text is null) or (btrim(due_text) <> ''::text))),
    constraint course_assessment_items_position_check check ((position > 0)),
    constraint course_assessment_items_title_check check ((btrim(title) <> ''::text)),
    constraint course_assessment_items_weight_check check (((weight is null) or ((weight >= (0)::numeric) and (weight <= (100)::numeric))))
);

create table if not exists public.course_assessment_outcomes (
    version_id bigint not null,
    assessment_item_id bigint not null,
    learning_outcome_id bigint not null,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.course_attributes (
    id bigint not null,
    version_id bigint not null,
    position integer not null,
    attribute_kind text not null,
    value text not null,
    source_text text not null,
    created_at timestamp with time zone default now() not null,
    constraint course_attributes_kind_check check ((attribute_kind = any (array['stem'::text, 'graduate_attribute'::text, 'other'::text]))),
    constraint course_attributes_position_check check ((position > 0)),
    constraint course_attributes_source_text_not_blank_check check ((btrim(source_text) <> ''::text)),
    constraint course_attributes_value_not_blank_check check ((btrim(value) <> ''::text))
);

create table if not exists public.course_fees (
    id bigint not null,
    version_id bigint not null,
    position integer not null,
    fee_year smallint,
    audience text not null,
    fee_type text not null,
    amount numeric(12,2),
    currency text,
    basis text default 'unknown'::text not null,
    student_contribution_band smallint,
    source_label text,
    source_text text,
    created_at timestamp with time zone default now() not null,
    constraint course_fees_amount_check check (((amount is null) or (amount >= (0)::numeric))),
    constraint course_fees_audience_check check ((audience = any (array['domestic'::text, 'international'::text, 'commonwealth_supported'::text, 'other'::text]))),
    constraint course_fees_band_check check (((student_contribution_band is null) or (student_contribution_band > 0))),
    constraint course_fees_basis_check check ((basis = any (array['course'::text, 'unit'::text, 'eftsl'::text, 'annual'::text, 'unknown'::text]))),
    constraint course_fees_currency_check check (((currency is null) or (currency ~ '^[A-Z]{3}$'::text))),
    constraint course_fees_fee_type_check check ((fee_type = any (array['student_contribution'::text, 'tuition'::text, 'indicative'::text, 'other'::text]))),
    constraint course_fees_fee_year_check check (((fee_year is null) or ((fee_year >= 2000) and (fee_year <= 2200)))),
    constraint course_fees_position_check check ((position > 0)),
    constraint course_fees_value_check check (((amount is not null) or (student_contribution_band is not null) or ((source_text is not null) and (btrim(source_text) <> ''::text))))
);

create table if not exists public.course_learning_outcomes (
    id bigint not null,
    position integer not null,
    body text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    version_id bigint not null,
    constraint course_learning_outcomes_body_check check ((btrim(body) <> ''::text)),
    constraint course_learning_outcomes_position_check check ((position > 0))
);

create table if not exists public.course_offerings (
    id bigint not null,
    delivery_mode text,
    location text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    version_id bigint not null,
    academic_year_id bigint not null,
    source_page_id bigint
);

create table if not exists public.course_related_courses (
    id bigint not null,
    version_id bigint not null,
    position integer not null,
    relation_kind text not null,
    related_course_id bigint not null,
    source_course_code text not null,
    source_course_title text,
    source_text text,
    created_at timestamp with time zone default now() not null,
    constraint course_related_courses_position_check check ((position > 0)),
    constraint course_related_courses_relation_kind_check check ((relation_kind = any (array['co_taught'::text, 'equivalent'::text, 'other'::text]))),
    constraint course_related_courses_source_course_code_check check ((source_course_code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'::text))
);

create table if not exists public.course_unit_options (
    id bigint not null,
    version_id bigint not null,
    position integer not null,
    units numeric(6,2) not null,
    label text,
    source_text text not null,
    created_at timestamp with time zone default now() not null,
    constraint course_unit_options_label_check check (((label is null) or (btrim(label) <> ''::text))),
    constraint course_unit_options_position_check check ((position > 0)),
    constraint course_unit_options_source_text_not_blank_check check ((btrim(source_text) <> ''::text)),
    constraint course_unit_options_units_check check ((units > (0)::numeric))
);

create table if not exists public.course_version_details (
    version_id bigint not null,
    kind text default 'course'::text not null,
    title text not null,
    unit_value_kind text default 'fixed'::text not null,
    units numeric(6,2),
    minimum_units numeric(6,2),
    maximum_units numeric(6,2),
    eftsl numeric(7,5),
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
    workload_hours numeric(7,2),
    inherent_requirements text,
    prescribed_texts text,
    offering_status text default 'unknown'::text not null,
    source_updated_at timestamp with time zone,
    constraint course_version_details_academic_career_check check (((academic_career is null) or (academic_career = any (array['UGRD'::text, 'PGRD'::text, 'RSCH'::text, 'OTHER'::text])))),
    constraint course_version_details_eftsl_check check (((eftsl is null) or (eftsl >= (0)::numeric))),
    constraint course_version_details_kind_check check ((kind = 'course'::text)),
    constraint course_version_details_level_check check (((level >= 0) and (level <= 9999))),
    constraint course_version_details_offering_status_check check ((offering_status = any (array['offered'::text, 'not_offered'::text, 'unknown'::text]))),
    constraint course_version_details_subject_code_check check ((subject_code ~ '^[A-Z]{4}$'::text)),
    constraint course_version_details_title_not_blank_check check ((btrim(title) <> ''::text)),
    constraint course_version_details_unit_value_kind_check check ((unit_value_kind = any (array['fixed'::text, 'range'::text, 'variable'::text, 'unknown'::text]))),
    constraint course_version_details_units_check check ((((units is null) or (units >= (0)::numeric)) and ((minimum_units is null) or (minimum_units >= (0)::numeric)) and ((maximum_units is null) or (maximum_units >= (0)::numeric)) and ((minimum_units is null) or (maximum_units is null) or (maximum_units >= minimum_units)) and ((unit_value_kind <> 'fixed'::text) or (units is not null)))),
    constraint course_version_details_workload_hours_check check (((workload_hours is null) or (workload_hours >= (0)::numeric)))
);

create table if not exists public.offering_sessions (
    id bigint not null,
    course_offering_id bigint not null,
    academic_period_id bigint,
    delivery_mode text,
    location text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    class_number text,
    starts_on date,
    enrol_closes_on date,
    census_on date,
    ends_on date,
    class_summary_url text,
    version_id bigint not null,
    academic_year_id bigint not null,
    source_page_id bigint,
    position integer not null,
    source_text text not null,
    academic_period_code text not null,
    academic_period_name text not null,
    constraint offering_sessions_dates_check check (((ends_on is null) or (starts_on is null) or (ends_on >= starts_on))),
    constraint offering_sessions_period_source_check check ((((academic_period_code is null) or (btrim(academic_period_code) <> ''::text)) and ((academic_period_name is null) or (btrim(academic_period_name) <> ''::text)))),
    constraint offering_sessions_position_check check (((position is null) or (position > 0))),
    constraint offering_sessions_source_text_check check (((source_text is null) or (btrim(source_text) <> ''::text)))
);

create table if not exists public.requirement_condition_options (
    id bigint not null,
    condition_id bigint not null,
    version_id bigint not null,
    position integer not null,
    kind text not null,
    code text not null,
    code_id bigint,
    title text,
    source_text text,
    constraint requirement_condition_options_code_check check (
case kind
    when 'course'::text then (code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'::text)
    else (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'::text)
end),
    constraint requirement_condition_options_kind_check check ((kind = any (array['course'::text, 'programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text]))),
    constraint requirement_condition_options_position_check check ((position > 0))
);

create table if not exists public.requirement_conditions (
    id bigint not null,
    rule_id bigint not null,
    version_id bigint not null,
    group_id bigint not null,
    condition_key text not null,
    position integer default 0 not null,
    condition_kind text not null,
    code_id bigint,
    structure_kind text,
    requirement_mode text,
    minimum_mark numeric(5,2),
    minimum_units numeric(7,2),
    maximum_units numeric(7,2),
    minimum_count smallint,
    subject_code text,
    minimum_level smallint,
    maximum_level smallint,
    minimum_year smallint,
    minimum_gpa numeric(3,2),
    minimum_wam numeric(5,2),
    tag text,
    free_text text,
    hardness text default 'hard'::text not null,
    source_text text,
    source_locator text,
    review_state text default 'automatic'::text not null,
    confidence numeric(5,4) default 1 not null,
    item_kind text,
    constraint requirement_conditions_confidence_check check (((confidence >= (0)::numeric) and (confidence <= (1)::numeric))),
    constraint requirement_conditions_hardness_check check ((hardness = any (array['hard'::text, 'advisory'::text]))),
    constraint requirement_conditions_item_kind_check check ((((code_id is null) and (item_kind is null)) or ((code_id is not null) and (item_kind is not null) and
case
    when (condition_kind = any (array['course'::text, 'incompatible'::text])) then (item_kind = 'course'::text)
    when (condition_kind = 'structure'::text) then (item_kind = any (array['programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text]))
    else false
end))),
    constraint requirement_conditions_key_check check ((btrim(condition_key) <> ''::text)),
    constraint requirement_conditions_kind_check check ((condition_kind = any (array['course'::text, 'incompatible'::text, 'structure'::text, 'structure_set'::text, 'course_set_units'::text, 'units_total'::text, 'subject_units'::text, 'level_units'::text, 'tagged_units'::text, 'elective_units'::text, 'year_standing'::text, 'gpa'::text, 'wam'::text, 'permission'::text, 'other'::text]))),
    constraint requirement_conditions_levels_check check ((((minimum_level is null) or ((minimum_level >= 0) and (minimum_level <= 9999))) and ((maximum_level is null) or ((maximum_level >= 0) and (maximum_level <= 9999))) and ((minimum_level is null) or (maximum_level is null) or (maximum_level >= minimum_level)))),
    constraint requirement_conditions_minimum_count_check check (((minimum_count is null) or (minimum_count > 0))),
    constraint requirement_conditions_minimum_gpa_check check (((minimum_gpa is null) or ((minimum_gpa >= (0)::numeric) and (minimum_gpa <= (7)::numeric)))),
    constraint requirement_conditions_minimum_mark_check check (((minimum_mark is null) or ((minimum_mark >= (0)::numeric) and (minimum_mark <= (100)::numeric)))),
    constraint requirement_conditions_minimum_wam_check check (((minimum_wam is null) or ((minimum_wam >= (0)::numeric) and (minimum_wam <= (100)::numeric)))),
    constraint requirement_conditions_minimum_year_check check (((minimum_year is null) or ((minimum_year >= 1) and (minimum_year <= 10)))),
    constraint requirement_conditions_position_check check ((position >= 0)),
    constraint requirement_conditions_requirement_mode_check check ((((condition_kind = 'course'::text) = (requirement_mode is not null)) and ((requirement_mode is null) or (requirement_mode = any (array['completed'::text, 'completed_or_concurrent'::text]))))),
    constraint requirement_conditions_review_state_check check ((review_state = any (array['automatic'::text, 'verified'::text, 'review'::text]))),
    constraint requirement_conditions_structure_kind_check check (((structure_kind is null) or (structure_kind = any (array['programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text])))),
    constraint requirement_conditions_subject_code_check check (((subject_code is null) or (subject_code ~ '^[A-Z]{4}$'::text))),
    constraint requirement_conditions_typed_value_check check (
case condition_kind
    when 'course'::text then (code_id is not null)
    when 'incompatible'::text then (code_id is not null)
    when 'structure'::text then ((code_id is not null) or (free_text is not null))
    when 'structure_set'::text then (structure_kind is not null)
    when 'course_set_units'::text then ((minimum_units is not null) or (maximum_units is not null) or (minimum_count is not null))
    when 'units_total'::text then ((minimum_units is not null) or (maximum_units is not null))
    when 'subject_units'::text then ((subject_code is not null) and ((minimum_units is not null) or (maximum_units is not null)))
    when 'level_units'::text then ((minimum_level is not null) and ((minimum_units is not null) or (maximum_units is not null)))
    when 'tagged_units'::text then ((tag is not null) and ((minimum_units is not null) or (maximum_units is not null)))
    when 'elective_units'::text then ((minimum_units is not null) or (maximum_units is not null))
    when 'year_standing'::text then (minimum_year is not null)
    when 'gpa'::text then (minimum_gpa is not null)
    when 'wam'::text then (minimum_wam is not null)
    when 'permission'::text then (free_text is not null)
    when 'other'::text then (free_text is not null)
    else null::boolean
end),
    constraint requirement_conditions_units_check check ((((minimum_units is null) or (minimum_units >= (0)::numeric)) and ((maximum_units is null) or (maximum_units >= (0)::numeric)) and ((minimum_units is null) or (maximum_units is null) or (maximum_units >= minimum_units))))
);

create table if not exists public.requirement_groups (
    id bigint not null,
    rule_id bigint not null,
    version_id bigint not null,
    parent_group_id bigint,
    group_key text not null,
    label text,
    description text,
    operator text not null,
    minimum_count smallint,
    minimum_units numeric(7,2),
    maximum_units numeric(7,2),
    source_text text,
    source_locator text,
    position integer default 0 not null,
    constraint requirement_groups_key_check check ((btrim(group_key) <> ''::text)),
    constraint requirement_groups_label_check check (((label is null) or (btrim(label) <> ''::text))),
    constraint requirement_groups_minimum_count_check check ((((operator = 'at_least'::text) and (minimum_count is not null) and (minimum_count > 0)) or ((operator <> 'at_least'::text) and (minimum_count is null)))),
    constraint requirement_groups_not_self_parent_check check (((parent_group_id is null) or (parent_group_id <> id))),
    constraint requirement_groups_operator_check check ((operator = any (array['all_of'::text, 'any_of'::text, 'at_least'::text]))),
    constraint requirement_groups_position_check check ((position >= 0)),
    constraint requirement_groups_units_check check ((((minimum_units is null) or (minimum_units > (0)::numeric)) and ((maximum_units is null) or (maximum_units > (0)::numeric)) and ((minimum_units is null) or (maximum_units is null) or (maximum_units >= minimum_units))))
);

create table if not exists public.requirement_item_references (
    id bigint not null,
    rule_id bigint not null,
    version_id bigint not null,
    code_id bigint not null,
    source_text text not null,
    confidence numeric(5,4) default 0 not null,
    review_state text default 'review'::text not null,
    constraint requirement_item_references_confidence_check check (((confidence >= (0)::numeric) and (confidence <= (1)::numeric))),
    constraint requirement_item_references_review_state_check check ((review_state = any (array['automatic'::text, 'verified'::text, 'review'::text]))),
    constraint requirement_item_references_source_text_check check ((btrim(source_text) <> ''::text))
);

create table if not exists public.requirement_rules (
    id bigint not null,
    version_id bigint not null,
    academic_year_id bigint not null,
    source_page_id bigint,
    rule_kind text not null,
    hardness text default 'hard'::text not null,
    source_text text not null,
    source_locator text,
    review_state text default 'automatic'::text not null,
    confidence numeric(5,4) default 1 not null,
    position integer default 0 not null,
    created_at timestamp with time zone default now() not null,
    constraint requirement_rules_confidence_check check (((confidence >= (0)::numeric) and (confidence <= (1)::numeric))),
    constraint requirement_rules_hardness_check check ((hardness = any (array['hard'::text, 'advisory'::text]))),
    constraint requirement_rules_kind_check check ((rule_kind = any (array['prerequisite'::text, 'corequisite'::text, 'incompatibility'::text, 'permission'::text, 'assumed_knowledge'::text, 'structure'::text]))),
    constraint requirement_rules_position_check check ((position >= 0)),
    constraint requirement_rules_review_state_check check ((review_state = any (array['automatic'::text, 'verified'::text, 'review'::text]))),
    constraint requirement_rules_source_text_check check ((btrim(source_text) <> ''::text))
);

create table if not exists public.structure_snapshot_summary_fields (
    version_id bigint not null,
    position integer not null,
    value_position integer not null,
    field_key text not null,
    label text not null,
    field_value text not null,
    source_text text not null,
    constraint structure_snapshot_summary_fields_key_check check ((field_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'::text)),
    constraint structure_snapshot_summary_fields_label_check check ((btrim(label) <> ''::text)),
    constraint structure_snapshot_summary_fields_position_check check ((position > 0)),
    constraint structure_snapshot_summary_fields_source_text_check check ((btrim(source_text) <> ''::text)),
    constraint structure_snapshot_summary_fields_value_check check ((btrim(field_value) <> ''::text)),
    constraint structure_snapshot_summary_fields_value_position_check check ((value_position > 0))
);

create table if not exists public.structure_version_details (
    version_id bigint not null,
    kind text not null,
    name text not null,
    acronym text,
    short_name text,
    introduction text,
    description text,
    units numeric(7,2),
    duration_years numeric(4,1),
    academic_career text,
    college text,
    mode_of_delivery text,
    selection_rank numeric(5,2),
    atar numeric(5,2),
    can_combine boolean,
    can_combine_vertical boolean,
    study_as text,
    contact_text text,
    constraint structure_version_details_duration_check check (((duration_years is null) or (duration_years > (0)::numeric))),
    constraint structure_version_details_kind_check check ((kind = any (array['programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text]))),
    constraint structure_version_details_name_check check ((btrim(name) <> ''::text)),
    constraint structure_version_details_units_check check (((units is null) or (units > (0)::numeric)))
);

alter table public.academic_structure_fees ALTER column id add generated always as identity (
    sequence NAME public.academic_structure_fees_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.academic_structure_learning_outcomes ALTER column id add generated always as identity (
    sequence NAME public.academic_structure_learning_outcomes_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.academic_structure_snapshot_relationships ALTER column id add generated always as identity (
    sequence NAME public.academic_structure_snapshot_relationships_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.academic_structure_snapshot_sections ALTER column id add generated always as identity (
    sequence NAME public.academic_structure_snapshot_sections_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_codes ALTER column id add generated always as identity (
    sequence NAME public.catalogue_codes_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_publications ALTER column id add generated always as identity (
    sequence NAME public.catalogue_publications_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_records ALTER column id add generated always as identity (
    sequence NAME public.catalogue_records_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_sources ALTER column id add generated always as identity (
    sequence NAME public.catalogue_sources_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_version_provenance ALTER column id add generated always as identity (
    sequence NAME public.catalogue_version_provenance_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_versions ALTER column id add generated always as identity (
    sequence NAME public.catalogue_versions_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.course_areas_of_interest ALTER column id add generated always as identity (
    sequence NAME public.course_areas_of_interest_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.course_assessment_items ALTER column id add generated always as identity (
    sequence NAME public.course_assessment_items_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.course_attributes ALTER column id add generated always as identity (
    sequence NAME public.course_attributes_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.course_fees ALTER column id add generated always as identity (
    sequence NAME public.course_fees_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.course_learning_outcomes ALTER column id add generated always as identity (
    sequence NAME public.course_learning_outcomes_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.course_offerings ALTER column id add generated always as identity (
    sequence NAME public.course_offerings_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.course_related_courses ALTER column id add generated always as identity (
    sequence NAME public.course_related_courses_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.course_unit_options ALTER column id add generated always as identity (
    sequence NAME public.course_unit_options_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.offering_sessions ALTER column id add generated always as identity (
    sequence NAME public.offering_sessions_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.requirement_condition_options ALTER column id add generated always as identity (
    sequence NAME public.requirement_condition_options_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.requirement_conditions ALTER column id add generated always as identity (
    sequence NAME public.requirement_conditions_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.requirement_groups ALTER column id add generated always as identity (
    sequence NAME public.requirement_groups_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.requirement_item_references ALTER column id add generated always as identity (
    sequence NAME public.requirement_item_references_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.requirement_rules ALTER column id add generated always as identity (
    sequence NAME public.requirement_rules_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table only public.academic_structure_fees
    add constraint academic_structure_fees_pkey primary key (id);

alter table only public.academic_structure_fees
    add constraint academic_structure_fees_position_unique unique (version_id, position);

alter table only public.academic_structure_learning_outcomes
    add constraint academic_structure_learning_outcomes_pkey primary key (id);

alter table only public.academic_structure_learning_outcomes
    add constraint academic_structure_learning_outcomes_position_unique unique (version_id, position);

alter table only public.academic_structure_snapshot_relationships
    add constraint academic_structure_snapshot_relationships_pkey primary key (id);

alter table only public.academic_structure_snapshot_relationships
    add constraint academic_structure_snapshot_relationships_position_unique unique (version_id, position);

alter table only public.academic_structure_snapshot_relationships
    add constraint academic_structure_snapshot_relationships_unique unique (version_id, relationship_kind, target_kind, target_code);

alter table only public.academic_structure_snapshot_sections
    add constraint academic_structure_snapshot_sections_key_unique unique (version_id, section_key);

alter table only public.academic_structure_snapshot_sections
    add constraint academic_structure_snapshot_sections_pkey primary key (id);

alter table only public.academic_structure_snapshot_sections
    add constraint academic_structure_snapshot_sections_position_unique unique (version_id, position);

alter table only public.catalogue_codes
    add constraint catalogue_codes_id_kind_unique unique (id, kind);

alter table only public.catalogue_codes
    add constraint catalogue_codes_kind_code_unique unique (kind, code);

alter table only public.catalogue_codes
    add constraint catalogue_codes_pkey primary key (id);

alter table only public.catalogue_codes
    add constraint catalogue_codes_public_id_unique unique (public_id);

alter table only public.catalogue_publications
    add constraint catalogue_publications_pkey primary key (id);

alter table only public.catalogue_records
    add constraint catalogue_records_code_year_unique unique (code_id, academic_year_id);

alter table only public.catalogue_records
    add constraint catalogue_records_id_kind_unique unique (id, kind);

alter table only public.catalogue_records
    add constraint catalogue_records_id_year_unique unique (id, academic_year_id);

alter table only public.catalogue_records
    add constraint catalogue_records_pkey primary key (id);

alter table only public.catalogue_records
    add constraint catalogue_records_public_id_unique unique (public_id);

alter table only public.catalogue_sources
    add constraint catalogue_sources_kind_base_url_unique unique (kind, base_url);

alter table only public.catalogue_sources
    add constraint catalogue_sources_pkey primary key (id);

alter table only public.catalogue_version_provenance
    add constraint catalogue_version_provenance_pkey primary key (id);

alter table only public.catalogue_versions
    add constraint catalogue_versions_id_item_year_unique unique (id, record_id);

alter table only public.catalogue_versions
    add constraint catalogue_versions_id_kind_unique unique (id, kind);

alter table only public.catalogue_versions
    add constraint catalogue_versions_id_year_unique unique (id, academic_year_id);

alter table only public.catalogue_versions
    add constraint catalogue_versions_pkey primary key (id);

alter table only public.catalogue_versions
    add constraint catalogue_versions_public_id_unique unique (public_id);

alter table only public.course_areas_of_interest
    add constraint course_areas_of_interest_pkey primary key (id);

alter table only public.course_areas_of_interest
    add constraint course_areas_of_interest_snapshot_name_unique unique (version_id, name);

alter table only public.course_areas_of_interest
    add constraint course_areas_of_interest_snapshot_position_unique unique (version_id, position);

alter table only public.course_assessment_items
    add constraint course_assessment_items_id_snapshot_unique unique (id, version_id);

alter table only public.course_assessment_items
    add constraint course_assessment_items_pkey primary key (id);

alter table only public.course_assessment_items
    add constraint course_assessment_items_snapshot_position_unique unique (version_id, position);

alter table only public.course_assessment_outcomes
    add constraint course_assessment_outcomes_pkey primary key (assessment_item_id, learning_outcome_id);

alter table only public.course_attributes
    add constraint course_attributes_pkey primary key (id);

alter table only public.course_attributes
    add constraint course_attributes_snapshot_position_unique unique (version_id, position);

alter table only public.course_attributes
    add constraint course_attributes_snapshot_value_unique unique (version_id, attribute_kind, value);

alter table only public.course_fees
    add constraint course_fees_pkey primary key (id);

alter table only public.course_fees
    add constraint course_fees_snapshot_position_unique unique (version_id, position);

alter table only public.course_learning_outcomes
    add constraint course_learning_outcomes_id_snapshot_unique unique (id, version_id);

alter table only public.course_learning_outcomes
    add constraint course_learning_outcomes_pkey primary key (id);

alter table only public.course_learning_outcomes
    add constraint course_learning_outcomes_snapshot_position_unique unique (version_id, position);

alter table only public.course_offerings
    add constraint course_offerings_course_snapshot_unique unique (version_id);

alter table only public.course_offerings
    add constraint course_offerings_id_snapshot_unique unique (id, version_id);

alter table only public.course_offerings
    add constraint course_offerings_pkey primary key (id);

alter table only public.course_related_courses
    add constraint course_related_courses_identity_unique unique (version_id, relation_kind, source_course_code);

alter table only public.course_related_courses
    add constraint course_related_courses_pkey primary key (id);

alter table only public.course_related_courses
    add constraint course_related_courses_snapshot_position_unique unique (version_id, position);

alter table only public.course_unit_options
    add constraint course_unit_options_pkey primary key (id);

alter table only public.course_unit_options
    add constraint course_unit_options_snapshot_position_unique unique (version_id, position);

alter table only public.course_unit_options
    add constraint course_unit_options_snapshot_units_unique unique (version_id, units);

alter table only public.course_version_details
    add constraint course_version_details_pkey primary key (version_id);

alter table only public.offering_sessions
    add constraint offering_sessions_pkey primary key (id);

alter table only public.offering_sessions
    add constraint offering_sessions_snapshot_period_class_unique unique nulls not distinct (version_id, academic_period_code, class_number);

alter table only public.offering_sessions
    add constraint offering_sessions_snapshot_position_unique unique (version_id, position);

alter table only public.requirement_condition_options
    add constraint requirement_condition_options_code_unique unique (condition_id, code);

alter table only public.requirement_condition_options
    add constraint requirement_condition_options_pkey primary key (id);

alter table only public.requirement_condition_options
    add constraint requirement_condition_options_position_unique unique (condition_id, position);

alter table only public.requirement_conditions
    add constraint requirement_conditions_group_position_unique unique (group_id, position);

alter table only public.requirement_conditions
    add constraint requirement_conditions_id_snapshot_unique unique (id, version_id);

alter table only public.requirement_conditions
    add constraint requirement_conditions_key_unique unique (version_id, condition_key);

alter table only public.requirement_conditions
    add constraint requirement_conditions_pkey primary key (id);

alter table only public.requirement_groups
    add constraint requirement_groups_id_rule_unique unique (id, rule_id);

alter table only public.requirement_groups
    add constraint requirement_groups_id_snapshot_unique unique (id, version_id);

alter table only public.requirement_groups
    add constraint requirement_groups_key_unique unique (version_id, group_key);

alter table only public.requirement_groups
    add constraint requirement_groups_pkey primary key (id);

alter table only public.requirement_item_references
    add constraint requirement_item_references_pkey primary key (id);

alter table only public.requirement_item_references
    add constraint requirement_item_references_unique unique (rule_id, code_id);

alter table only public.requirement_rules
    add constraint requirement_rules_id_snapshot_unique unique (id, version_id);

alter table only public.requirement_rules
    add constraint requirement_rules_pkey primary key (id);

alter table only public.requirement_rules
    add constraint requirement_rules_snapshot_kind_unique unique (version_id, rule_kind);

alter table only public.structure_snapshot_summary_fields
    add constraint structure_snapshot_summary_fields_pkey primary key (version_id, position, value_position);

alter table only public.structure_version_details
    add constraint structure_version_details_pkey primary key (version_id);

alter table only public.academic_structure_fees
    add constraint academic_structure_fees_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.academic_structure_learning_outcomes
    add constraint academic_structure_learning_outcomes_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.academic_structure_snapshot_relationships
    add constraint academic_structure_snapshot_relationships_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.academic_structure_snapshot_sections
    add constraint academic_structure_snapshot_sections_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.catalogue_publications
    add constraint catalogue_publications_published_by_fkey foreign key (published_by) references auth.users(id) on delete set null;

alter table only public.catalogue_publications
    add constraint catalogue_publications_record_id_fkey foreign key (record_id) references public.catalogue_records(id) on delete cascade;

alter table only public.catalogue_publications
    add constraint catalogue_publications_unpublished_by_fkey foreign key (unpublished_by) references auth.users(id) on delete set null;

alter table only public.catalogue_publications
    add constraint catalogue_publications_version_record_fkey foreign key (version_id, record_id) references public.catalogue_versions(id, record_id);

alter table only public.catalogue_records
    add constraint catalogue_records_academic_year_id_fkey foreign key (academic_year_id) references public.academic_years(id);

alter table only public.catalogue_records
    add constraint catalogue_records_code_kind_fkey foreign key (code_id, kind) references public.catalogue_codes(id, kind) on delete cascade;

alter table only public.catalogue_records
    add constraint catalogue_records_latest_source_version_fkey foreign key (latest_source_version_id, id) references public.catalogue_versions(id, record_id);

alter table only public.catalogue_records
    add constraint catalogue_records_published_version_fkey foreign key (published_version_id, id) references public.catalogue_versions(id, record_id);

alter table only public.catalogue_version_provenance
    add constraint catalogue_version_provenance_snapshot_fkey foreign key (version_id, academic_year_id) references public.catalogue_versions(id, academic_year_id) on delete cascade;

alter table only public.catalogue_versions
    add constraint catalogue_versions_based_on_fkey foreign key (based_on_version_id, record_id) references public.catalogue_versions(id, record_id);

alter table only public.catalogue_versions
    add constraint catalogue_versions_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;

alter table only public.catalogue_versions
    add constraint catalogue_versions_item_year_fkey foreign key (record_id, academic_year_id) references public.catalogue_records(id, academic_year_id) on delete cascade;

alter table only public.catalogue_versions
    add constraint catalogue_versions_item_year_kind_fkey foreign key (record_id, kind) references public.catalogue_records(id, kind) on delete cascade;

alter table only public.course_areas_of_interest
    add constraint course_areas_of_interest_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.course_assessment_items
    add constraint course_assessment_items_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.course_assessment_outcomes
    add constraint course_assessment_outcomes_assessment_snapshot_fkey foreign key (assessment_item_id, version_id) references public.course_assessment_items(id, version_id) on delete cascade;

alter table only public.course_assessment_outcomes
    add constraint course_assessment_outcomes_learning_outcome_snapshot_fkey foreign key (learning_outcome_id, version_id) references public.course_learning_outcomes(id, version_id) on delete cascade;

alter table only public.course_assessment_outcomes
    add constraint course_assessment_outcomes_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.course_attributes
    add constraint course_attributes_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.course_fees
    add constraint course_fees_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.course_learning_outcomes
    add constraint course_learning_outcomes_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.course_offerings
    add constraint course_offerings_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.course_offerings
    add constraint course_offerings_snapshot_year_fkey foreign key (version_id, academic_year_id) references public.catalogue_versions(id, academic_year_id) on delete cascade;

alter table only public.course_related_courses
    add constraint course_related_courses_related_item_fkey foreign key (related_course_id) references public.catalogue_codes(id);

alter table only public.course_related_courses
    add constraint course_related_courses_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.course_unit_options
    add constraint course_unit_options_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.course_version_details
    add constraint course_version_details_snapshot_kind_fkey foreign key (version_id, kind) references public.catalogue_versions(id, kind) on delete cascade;

alter table only public.offering_sessions
    add constraint offering_sessions_academic_period_id_fkey foreign key (academic_period_id) references public.academic_periods(id);

alter table only public.offering_sessions
    add constraint offering_sessions_offering_snapshot_fkey foreign key (course_offering_id, version_id) references public.course_offerings(id, version_id) on delete cascade;

alter table only public.offering_sessions
    add constraint offering_sessions_snapshot_id_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.offering_sessions
    add constraint offering_sessions_snapshot_year_fkey foreign key (version_id, academic_year_id) references public.catalogue_versions(id, academic_year_id) on delete cascade;

alter table only public.requirement_condition_options
    add constraint requirement_condition_options_condition_fkey foreign key (condition_id, version_id) references public.requirement_conditions(id, version_id) on delete cascade;

alter table only public.requirement_condition_options
    add constraint requirement_condition_options_item_fkey foreign key (code_id, kind) references public.catalogue_codes(id, kind);

alter table only public.requirement_conditions
    add constraint requirement_conditions_group_fkey foreign key (group_id, rule_id) references public.requirement_groups(id, rule_id) on delete cascade;

alter table only public.requirement_conditions
    add constraint requirement_conditions_item_fkey foreign key (code_id, item_kind) references public.catalogue_codes(id, kind);

alter table only public.requirement_conditions
    add constraint requirement_conditions_rule_fkey foreign key (rule_id, version_id) references public.requirement_rules(id, version_id) on delete cascade;

alter table only public.requirement_groups
    add constraint requirement_groups_parent_fkey foreign key (parent_group_id, rule_id) references public.requirement_groups(id, rule_id) on delete cascade;

alter table only public.requirement_groups
    add constraint requirement_groups_rule_fkey foreign key (rule_id, version_id) references public.requirement_rules(id, version_id) on delete cascade;

alter table only public.requirement_item_references
    add constraint requirement_item_references_item_fkey foreign key (code_id) references public.catalogue_codes(id);

alter table only public.requirement_item_references
    add constraint requirement_item_references_rule_fkey foreign key (rule_id, version_id) references public.requirement_rules(id, version_id) on delete cascade;

alter table only public.requirement_rules
    add constraint requirement_rules_snapshot_fkey foreign key (version_id, academic_year_id) references public.catalogue_versions(id, academic_year_id) on delete cascade;

alter table only public.structure_snapshot_summary_fields
    add constraint structure_snapshot_summary_fields_snapshot_fkey foreign key (version_id) references public.catalogue_versions(id) on delete cascade;

alter table only public.structure_version_details
    add constraint structure_version_details_snapshot_kind_fkey foreign key (version_id, kind) references public.catalogue_versions(id, kind) on delete cascade;

create index catalogue_codes_code_idx on public.catalogue_codes using btree (code);

create unique index catalogue_publications_one_current_idx on public.catalogue_publications using btree (record_id) where (unpublished_at is null);

create index catalogue_publications_record_idx on public.catalogue_publications using btree (record_id, published_at desc);

create index catalogue_records_academic_year_idx on public.catalogue_records using btree (academic_year_id, kind);

create index catalogue_records_published_idx on public.catalogue_records using btree (published_version_id) where (published_version_id is not null);

create index catalogue_version_provenance_snapshot_idx on public.catalogue_version_provenance using btree (version_id, field_path);

create index catalogue_versions_record_idx on public.catalogue_versions using btree (record_id, created_at desc);

create index course_areas_of_interest_course_snapshot_id_idx on public.course_areas_of_interest using btree (version_id);

create index course_assessment_items_course_snapshot_fk_idx on public.course_assessment_items using btree (version_id);

create index course_assessment_outcomes_assessment_snapshot_idx on public.course_assessment_outcomes using btree (assessment_item_id, version_id);

create index course_assessment_outcomes_outcome_snapshot_idx on public.course_assessment_outcomes using btree (learning_outcome_id, version_id);

create index course_fees_course_snapshot_id_idx on public.course_fees using btree (version_id);

create index course_learning_outcomes_course_snapshot_fk_idx on public.course_learning_outcomes using btree (version_id);

create index course_offerings_academic_year_id_idx on public.course_offerings using btree (academic_year_id);

create index course_offerings_course_snapshot_fk_idx on public.course_offerings using btree (version_id);

create index course_offerings_snapshot_year_idx on public.course_offerings using btree (version_id, academic_year_id);

create index course_offerings_source_page_year_idx on public.course_offerings using btree (source_page_id, academic_year_id);

create index course_related_courses_related_course_id_idx on public.course_related_courses using btree (related_course_id);

create index offering_sessions_academic_period_id_idx on public.offering_sessions using btree (academic_period_id);

create index offering_sessions_academic_year_id_idx on public.offering_sessions using btree (academic_year_id);

create index offering_sessions_class_number_idx on public.offering_sessions using btree (course_offering_id, class_number);

create index offering_sessions_course_snapshot_id_idx on public.offering_sessions using btree (version_id);

create index offering_sessions_offering_snapshot_idx on public.offering_sessions using btree (course_offering_id, version_id);

create index offering_sessions_snapshot_year_idx on public.offering_sessions using btree (version_id, academic_year_id);

create index offering_sessions_source_page_year_idx on public.offering_sessions using btree (source_page_id, academic_year_id);

create index requirement_condition_options_item_idx on public.requirement_condition_options using btree (code_id) where (code_id is not null);

create index requirement_conditions_item_idx on public.requirement_conditions using btree (code_id) where (code_id is not null);

create index requirement_conditions_rule_idx on public.requirement_conditions using btree (rule_id);

create index requirement_groups_rule_idx on public.requirement_groups using btree (rule_id, position);

create index requirement_item_references_item_idx on public.requirement_item_references using btree (code_id);

create index requirement_rules_snapshot_idx on public.requirement_rules using btree (version_id);

create or replace function private.can_write_catalogue() returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
  select private.has_permission('catalogue.write')
    or private.has_permission('imports.manage');
$$;

create or replace function private.enforce_catalogue_snapshot_immutability() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if tg_op = 'DELETE' then
    if old.sealed_at is null then
      return old;
    end if;
    if not exists (
      select 1 from public.catalogue_records where id = old.record_id
    ) then
      return old;
    end if;
    raise exception
      'catalogue_versions records are immutable; a sealed snapshot cannot be deleted'
      using errcode = '55000';
  end if;
  if old.sealed_at is null
    and new.sealed_at is not null
    and (to_jsonb(new) - 'sealed_at') = (to_jsonb(old) - 'sealed_at')
  then
    return new;
  end if;
  if (to_jsonb(new) - 'import_target_id' - 'created_by')
      = (to_jsonb(old) - 'import_target_id' - 'created_by')
    and (new.import_target_id is null or new.import_target_id = old.import_target_id)
    and (new.created_by is null or new.created_by = old.created_by)
  then
    return new;
  end if;
  raise exception
    'catalogue_versions records are immutable; create a new snapshot instead'
    using errcode = '55000';
end;
$$;

create or replace function private.enforce_catalogue_version_immutability() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if tg_op = 'UPDATE'
    and old.sealed_at is null
    and new.sealed_at is not null
    and (to_jsonb(new) - 'sealed_at') = (to_jsonb(old) - 'sealed_at')
  then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'sync_id' - 'created_by')
      = (to_jsonb(old) - 'sync_id' - 'created_by')
    and (new.sync_id is null or new.sync_id = old.sync_id)
    and (new.created_by is null or new.created_by = old.created_by)
  then
    return new;
  end if;
  raise exception 'Catalogue versions are immutable; create a new version instead.'
    using errcode = '55000';
end;
$$;

create or replace function private.guard_archived_catalogue_item_year() returns trigger
    language plpgsql
    set search_path to ''
    as $$
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
$$;

create or replace function private.guard_snapshot_child_mutation() returns trigger
    language plpgsql
    set search_path to ''
    as $$
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
$$;

create or replace function private.is_published_version(p_version_id bigint) returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
  select exists (
    select 1
    from public.catalogue_records as item_years
    where item_years.published_version_id = p_version_id
      and item_years.archived_at is null
  );
$$;

create or replace function private.programme_offers_structure(p_programme_snapshot_id bigint, p_structure_kind text, p_structure_code text) returns boolean
    language sql stable
    set search_path to ''
    as $$
  select exists (
    select 1
    from public.academic_structure_snapshot_relationships as relationships
    where relationships.version_id = p_programme_snapshot_id
      and relationships.relationship_kind in ('required', 'option')
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

create or replace function private.record_catalogue_publication() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
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
$$;

create or replace function private.reject_immutable_catalogue_record_mutation() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  raise exception '% records are immutable; create a new record instead', tg_table_name
    using errcode = '55000';
end;
$$;

create or replace function private.requirement_projection(p_version_id bigint) returns jsonb
    language sql stable
    set search_path to ''
    as $$
  select jsonb_build_object(
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', rules.rule_kind,
        'ruleKind', rules.rule_kind,
        'hardness', rules.hardness,
        'sourceText', rules.source_text,
        'reviewState', rules.review_state,
        'confidence', rules.confidence
      ) order by rules.position, case rules.rule_kind
        when 'prerequisite' then 1 when 'corequisite' then 2
        when 'incompatibility' then 3 when 'permission' then 4
        when 'assumed_knowledge' then 5 else 6 end)
      from public.requirement_rules as rules
      where rules.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleGroups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', groups.group_key,
        'ruleKey', rules.rule_kind,
        'parentGroupKey', parents.group_key,
        'operator', groups.operator,
        'minimumCount', groups.minimum_count,
        'minimumUnits', groups.minimum_units,
        'maximumUnits', groups.maximum_units,
        'label', groups.label,
        'description', groups.description,
        'sourceText', groups.source_text,
        'position', groups.position
      ) order by rules.rule_kind, groups.position, groups.id)
      from public.requirement_groups as groups
      join public.requirement_rules as rules on rules.id = groups.rule_id
      left join public.requirement_groups as parents on parents.id = groups.parent_group_id
      where groups.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleConditions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', conditions.condition_key,
        'ruleKey', rules.rule_kind,
        'groupKey', groups.group_key,
        'position', conditions.position,
        'conditionKind', conditions.condition_kind,
        'requiredCourseCode', case
          when conditions.condition_kind in ('course', 'incompatible') then items.code
        end,
        'requiredStructureCode', case
          when conditions.condition_kind = 'structure' then items.code
        end,
        'structureKind', conditions.structure_kind,
        'minimumUnits', conditions.minimum_units,
        'maximumUnits', conditions.maximum_units,
        'minimumCount', conditions.minimum_count,
        'minimumMark', conditions.minimum_mark,
        'subjectCode', conditions.subject_code,
        'minimumCourseLevel', conditions.minimum_level,
        'maximumCourseLevel', conditions.maximum_level,
        'minimumGpa', conditions.minimum_gpa,
        'minimumYear', conditions.minimum_year,
        'minimumWam', conditions.minimum_wam,
        'tag', conditions.tag,
        'freeText', conditions.free_text,
        'courseRequirementMode', conditions.requirement_mode,
        'hardness', conditions.hardness,
        'sourceText', conditions.source_text,
        'reviewState', conditions.review_state,
        'confidence', conditions.confidence
      ) order by rules.rule_kind, conditions.position, conditions.id)
      from public.requirement_conditions as conditions
      join public.requirement_rules as rules on rules.id = conditions.rule_id
      join public.requirement_groups as groups on groups.id = conditions.group_id
      left join public.catalogue_codes as items on items.id = conditions.code_id
      where conditions.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleConditionCourses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'conditionKey', conditions.condition_key,
        'position', options.position,
        'kind', options.kind,
        'sourceCourseCode', options.code,
        'title', options.title,
        'sourceText', options.source_text
      ) order by conditions.id, options.position)
      from public.requirement_condition_options as options
      join public.requirement_conditions as conditions on conditions.id = options.condition_id
      where options.version_id = p_version_id
    ), '[]'::jsonb),
    'ruleCourseReferences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ruleKey', rules.rule_kind,
        'referencedCourseCode', items.code,
        'sourceText', item_references.source_text,
        'reviewState', item_references.review_state,
        'confidence', item_references.confidence
      ) order by rules.rule_kind, items.code)
      from public.requirement_item_references as item_references
      join public.requirement_rules as rules on rules.id = item_references.rule_id
      join public.catalogue_codes as items on items.id = item_references.code_id
      where item_references.version_id = p_version_id
    ), '[]'::jsonb),
    'prerequisiteCodes', coalesce((
      select jsonb_agg(codes.code order by codes.code)
      from (
        select items.code
        from public.requirement_item_references as item_references
        join public.requirement_rules as rules on rules.id = item_references.rule_id
        join public.catalogue_codes as items on items.id = item_references.code_id
        where rules.version_id = p_version_id and rules.rule_kind = 'prerequisite'
        union
        select items.code
        from public.requirement_conditions as conditions
        join public.requirement_rules as rules on rules.id = conditions.rule_id
        join public.catalogue_codes as items on items.id = conditions.code_id
        where rules.version_id = p_version_id
          and rules.rule_kind = 'prerequisite'
          and conditions.condition_kind = 'course'
        union
        select options.code
        from public.requirement_condition_options as options
        join public.requirement_conditions as conditions on conditions.id = options.condition_id
        join public.requirement_rules as rules on rules.id = conditions.rule_id
        where rules.version_id = p_version_id
          and rules.rule_kind = 'prerequisite'
          and options.kind = 'course'
      ) as codes
    ), '[]'::jsonb)
  );
$$;

create or replace function private.seal_published_catalogue_version() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  update public.catalogue_versions
  set sealed_at = greatest(statement_timestamp(), created_at)
  where id = new.published_version_id
    and sealed_at is null;
  return new;
end;
$$;

create or replace function private.validate_requirement_condition_option() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if not exists (
    select 1
    from public.requirement_conditions as conditions
    where conditions.id = new.condition_id
      and conditions.condition_kind in ('course_set_units', 'structure_set')
  ) then
    raise exception 'requirement options belong to course_set_units or structure_set conditions'
      using errcode = '23503';
  end if;

  if new.code_id is not null and not exists (
    select 1 from public.catalogue_codes
    where id = new.code_id and kind = new.kind and code = new.code
  ) then
    raise exception 'requirement option item does not match its code'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace function private.validate_requirement_tree() returns trigger
    language plpgsql
    set search_path to ''
    as $$
declare
  old_rule_id bigint;
  new_rule_id bigint;
  target_rule_id bigint;
  root_count integer;
  group_count integer;
  reachable_count integer;
begin
  if tg_table_name = 'requirement_rules' then
    if tg_op <> 'INSERT' then old_rule_id := old.id; end if;
    if tg_op <> 'DELETE' then new_rule_id := new.id; end if;
  else
    if tg_op <> 'INSERT' then old_rule_id := old.rule_id; end if;
    if tg_op <> 'DELETE' then new_rule_id := new.rule_id; end if;
  end if;

  for target_rule_id in
    select distinct candidates.id
    from unnest(array[old_rule_id, new_rule_id]) as candidates(id)
    where candidates.id is not null
  loop
    if exists (select 1 from public.requirement_rules where id = target_rule_id) then
      select count(*) into root_count
      from public.requirement_groups
      where rule_id = target_rule_id and parent_group_id is null;

      if root_count <> 1 then
        raise exception 'requirement tree must contain exactly one root'
          using errcode = '23514', constraint = 'requirement_groups_exactly_one_root_check';
      end if;

      select count(*) into group_count
      from public.requirement_groups where rule_id = target_rule_id;

      with recursive reachable (id) as (
        select groups.id from public.requirement_groups as groups
        where groups.rule_id = target_rule_id and groups.parent_group_id is null
        union
        select children.id from public.requirement_groups as children
        join reachable on children.parent_group_id = reachable.id
        where children.rule_id = target_rule_id
      )
      select count(*) into reachable_count from reachable;

      if reachable_count <> group_count then
        raise exception 'requirement tree must be connected and acyclic'
          using errcode = '23514', constraint = 'requirement_groups_tree_shape_check';
      end if;
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.unpublish_catalogue_record(p_record_id bigint) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('catalogue.write') then
    raise exception using errcode = '42501', message = 'Publishing requires the catalogue.write permission.';
  end if;
  update public.catalogue_records
  set published_version_id = null
  where id = p_record_id and published_version_id is not null;
  if not found then
    raise exception using errcode = '55000', message = 'Nothing is published for this record.';
  end if;
end;
$$;

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

create or replace function private.structure_version_projection(p_version_id bigint) returns jsonb
    language sql stable
    set search_path to ''
    as $$
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
$$;

create or replace trigger academic_structure_fees_guard_sealed before insert or delete or update on public.academic_structure_fees for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger academic_structure_learning_outcomes_guard_sealed before insert or delete or update on public.academic_structure_learning_outcomes for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger academic_structure_snapshot_relationships_guard_sealed before insert or delete or update on public.academic_structure_snapshot_relationships for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger academic_structure_snapshot_sections_guard_sealed before insert or delete or update on public.academic_structure_snapshot_sections for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger catalogue_codes_set_updated_at before update on public.catalogue_codes for each row execute function private.set_updated_at();

create or replace trigger catalogue_records_record_publication after insert or update OF published_version_id on public.catalogue_records for each row execute function private.record_catalogue_publication();

create or replace trigger catalogue_records_seal_published_version before insert or update OF published_version_id on public.catalogue_records for each row execute function private.seal_published_catalogue_version();

create or replace trigger catalogue_records_set_updated_at before update on public.catalogue_records for each row execute function private.set_updated_at();

create or replace trigger catalogue_records_zz_guard_archived before update on public.catalogue_records for each row execute function private.guard_archived_catalogue_item_year();

create or replace trigger catalogue_sources_set_updated_at before update on public.catalogue_sources for each row execute function private.set_updated_at();

create or replace trigger catalogue_version_provenance_guard_sealed before insert or delete or update on public.catalogue_version_provenance for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger catalogue_versions_enforce_immutability before delete or update on public.catalogue_versions for each row execute function private.enforce_catalogue_version_immutability();

create or replace trigger course_areas_of_interest_guard_sealed before insert or delete or update on public.course_areas_of_interest for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger course_assessment_items_guard_sealed before insert or delete or update on public.course_assessment_items for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger course_assessment_items_set_updated_at before update on public.course_assessment_items for each row execute function private.set_updated_at();

create or replace trigger course_assessment_outcomes_guard_sealed before insert or delete or update on public.course_assessment_outcomes for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger course_attributes_guard_sealed before insert or delete or update on public.course_attributes for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger course_fees_guard_sealed before insert or delete or update on public.course_fees for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger course_learning_outcomes_guard_sealed before insert or delete or update on public.course_learning_outcomes for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger course_learning_outcomes_set_updated_at before update on public.course_learning_outcomes for each row execute function private.set_updated_at();

create or replace trigger course_offerings_guard_sealed before insert or delete or update on public.course_offerings for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger course_offerings_set_updated_at before update on public.course_offerings for each row execute function private.set_updated_at();

create or replace trigger course_related_courses_guard_sealed before insert or delete or update on public.course_related_courses for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger course_unit_options_guard_sealed before insert or delete or update on public.course_unit_options for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger course_version_details_guard_sealed before insert or delete or update on public.course_version_details for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger offering_sessions_guard_sealed before insert or delete or update on public.offering_sessions for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger offering_sessions_set_updated_at before update on public.offering_sessions for each row execute function private.set_updated_at();

create or replace trigger requirement_condition_options_guard_sealed before insert or delete or update on public.requirement_condition_options for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger requirement_condition_options_validate before insert or update on public.requirement_condition_options for each row execute function private.validate_requirement_condition_option();

create or replace trigger requirement_conditions_guard_sealed before insert or delete or update on public.requirement_conditions for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger requirement_groups_guard_sealed before insert or delete or update on public.requirement_groups for each row execute function private.guard_snapshot_child_mutation();

create constraint trigger requirement_groups_validate_tree after insert or delete or update on public.requirement_groups deferrable initially deferred for each row execute function private.validate_requirement_tree();

create or replace trigger requirement_item_references_guard_sealed before insert or delete or update on public.requirement_item_references for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger requirement_rules_guard_sealed before insert or delete or update on public.requirement_rules for each row execute function private.guard_snapshot_child_mutation();

create constraint trigger requirement_rules_validate_tree after insert or update on public.requirement_rules deferrable initially deferred for each row execute function private.validate_requirement_tree();

create or replace trigger structure_snapshot_summary_fields_guard_sealed before insert or delete or update on public.structure_snapshot_summary_fields for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger structure_version_details_guard_sealed before insert or delete or update on public.structure_version_details for each row execute function private.guard_snapshot_child_mutation();

create or replace trigger university_calendar_imports_reject_mutation before delete or update on public.university_calendar_imports for each row execute function private.reject_immutable_catalogue_record_mutation();

alter table public.academic_structure_fees enable row level security;

alter table public.academic_structure_learning_outcomes enable row level security;

alter table public.academic_structure_snapshot_relationships enable row level security;

alter table public.academic_structure_snapshot_sections enable row level security;

alter table public.catalogue_codes enable row level security;

alter table public.catalogue_publications enable row level security;

alter table public.catalogue_records enable row level security;

alter table public.catalogue_sources enable row level security;

alter table public.catalogue_version_provenance enable row level security;

alter table public.catalogue_versions enable row level security;

alter table public.course_areas_of_interest enable row level security;

alter table public.course_assessment_items enable row level security;

alter table public.course_assessment_outcomes enable row level security;

alter table public.course_attributes enable row level security;

alter table public.course_fees enable row level security;

alter table public.course_learning_outcomes enable row level security;

alter table public.course_offerings enable row level security;

alter table public.course_related_courses enable row level security;

alter table public.course_unit_options enable row level security;

alter table public.course_version_details enable row level security;

alter table public.offering_sessions enable row level security;

alter table public.requirement_condition_options enable row level security;

alter table public.requirement_conditions enable row level security;

alter table public.requirement_groups enable row level security;

alter table public.requirement_item_references enable row level security;

alter table public.requirement_rules enable row level security;

alter table public.structure_snapshot_summary_fields enable row level security;

alter table public.structure_version_details enable row level security;

create policy academic_structure_fees_admin_insert on public.academic_structure_fees for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy academic_structure_learning_outcomes_admin_insert on public.academic_structure_learning_outcomes for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy academic_structure_snapshot_relationships_admin_insert on public.academic_structure_snapshot_relationships for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy academic_structure_snapshot_sections_admin_insert on public.academic_structure_snapshot_sections for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy catalogue_codes_admin_write on public.catalogue_codes to authenticated using (( select private.can_write_catalogue() as can_write_catalogue)) with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy catalogue_records_admin_write on public.catalogue_records to authenticated using (( select private.can_write_catalogue() as can_write_catalogue)) with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy catalogue_sources_import_admin_all on public.catalogue_sources to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission)) with check (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_version_provenance_admin_insert on public.catalogue_version_provenance for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy catalogue_versions_admin_insert on public.catalogue_versions for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_areas_of_interest_admin_insert on public.course_areas_of_interest for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_assessment_items_admin_insert on public.course_assessment_items for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_assessment_outcomes_admin_insert on public.course_assessment_outcomes for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_attributes_admin_insert on public.course_attributes for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_fees_admin_insert on public.course_fees for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_learning_outcomes_admin_insert on public.course_learning_outcomes for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_offerings_admin_insert on public.course_offerings for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_related_courses_admin_insert on public.course_related_courses for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_unit_options_admin_insert on public.course_unit_options for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy course_version_details_admin_insert on public.course_version_details for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy offering_sessions_admin_insert on public.offering_sessions for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy requirement_condition_options_admin_insert on public.requirement_condition_options for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy requirement_conditions_admin_insert on public.requirement_conditions for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy requirement_groups_admin_insert on public.requirement_groups for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy requirement_item_references_admin_insert on public.requirement_item_references for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy requirement_rules_admin_insert on public.requirement_rules for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy structure_snapshot_summary_fields_admin_insert on public.structure_snapshot_summary_fields for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

create policy structure_version_details_admin_insert on public.structure_version_details for insert to authenticated with check (( select private.can_write_catalogue() as can_write_catalogue));

comment on table public.catalogue_codes is 'Permanent identity for courses, programmes, majors, minors and specialisations.';

comment on table public.catalogue_publications is 'Ledger of every published pointer change for a catalogue item year.';

comment on table public.catalogue_records is 'One row per catalogue item and academic year, holding the draft and published snapshot pointers.';

comment on table public.catalogue_sources is 'External systems that catalogue content is fetched from.';

comment on table public.catalogue_versions is 'Immutable versions of a catalogue item year. Kind-specific content lives in the details and child tables.';

comment on table public.course_attributes is 'Snapshot-owned STEM, graduate and future course attributes.';

comment on table public.course_unit_options is 'Snapshot-owned unit choices for variable-unit courses.';

comment on table public.structure_snapshot_summary_fields is 'Labelled key facts shown beside a structure heading, one row per listed value.';

comment on column public.course_assessment_items.learning_outcomes is 'Outcome numbers as printed, e.g. {2,3} for [LO 2,3]. These are positions matching course_learning_outcomes.position.';

comment on column public.course_assessment_items.source_text is 'The assessment line verbatim, so a parser change can be replayed without refetching ANU.';

comment on column public.offering_sessions.class_number is 'ANU class number, e.g. 10186. ANU''s own stable identifier for the class.';

-- Every object is taken back to nothing before it is granted anything, so the
-- grants below are the whole of what each role holds rather than an addition
-- to whatever Supabase's defaults already handed out.

revoke all on function private.can_write_catalogue() from public, anon, authenticated, service_role;

revoke all on function private.course_version_projection(p_version_id bigint) from public, anon, authenticated, service_role;

revoke all on function private.enforce_catalogue_snapshot_immutability() from public, anon, authenticated, service_role;

revoke all on function private.enforce_catalogue_version_immutability() from public, anon, authenticated, service_role;

revoke all on function private.guard_archived_catalogue_item_year() from public, anon, authenticated, service_role;

revoke all on function private.guard_snapshot_child_mutation() from public, anon, authenticated, service_role;

revoke all on function private.is_published_version(p_version_id bigint) from public, anon, authenticated, service_role;

revoke all on function private.programme_offers_structure(p_programme_snapshot_id bigint, p_structure_kind text, p_structure_code text) from public, anon, authenticated, service_role;

revoke all on function private.record_catalogue_publication() from public, anon, authenticated, service_role;

revoke all on function private.reject_immutable_catalogue_record_mutation() from public, anon, authenticated, service_role;

revoke all on function private.requirement_projection(p_version_id bigint) from public, anon, authenticated, service_role;

revoke all on function private.seal_published_catalogue_version() from public, anon, authenticated, service_role;

revoke all on function private.structure_version_projection(p_version_id bigint) from public, anon, authenticated, service_role;

revoke all on function private.validate_requirement_condition_option() from public, anon, authenticated, service_role;

revoke all on function private.validate_requirement_tree() from public, anon, authenticated, service_role;

revoke all on function public.unpublish_catalogue_record(p_record_id bigint) from public, anon, authenticated, service_role;

revoke all on table public.academic_structure_fees from public, anon, authenticated, service_role;

revoke all on sequence public.academic_structure_fees_id_seq from public, anon, authenticated, service_role;

revoke all on table public.academic_structure_learning_outcomes from public, anon, authenticated, service_role;

revoke all on sequence public.academic_structure_learning_outcomes_id_seq from public, anon, authenticated, service_role;

revoke all on table public.academic_structure_snapshot_relationships from public, anon, authenticated, service_role;

revoke all on sequence public.academic_structure_snapshot_relationships_id_seq from public, anon, authenticated, service_role;

revoke all on table public.academic_structure_snapshot_sections from public, anon, authenticated, service_role;

revoke all on sequence public.academic_structure_snapshot_sections_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_codes from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_codes_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_publications from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_publications_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_records from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_records_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_sources from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_sources_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_version_provenance from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_version_provenance_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_versions from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_versions_id_seq from public, anon, authenticated, service_role;

revoke all on table public.course_areas_of_interest from public, anon, authenticated, service_role;

revoke all on sequence public.course_areas_of_interest_id_seq from public, anon, authenticated, service_role;

revoke all on table public.course_assessment_items from public, anon, authenticated, service_role;

revoke all on sequence public.course_assessment_items_id_seq from public, anon, authenticated, service_role;

revoke all on table public.course_assessment_outcomes from public, anon, authenticated, service_role;

revoke all on table public.course_attributes from public, anon, authenticated, service_role;

revoke all on sequence public.course_attributes_id_seq from public, anon, authenticated, service_role;

revoke all on table public.course_fees from public, anon, authenticated, service_role;

revoke all on sequence public.course_fees_id_seq from public, anon, authenticated, service_role;

revoke all on table public.course_learning_outcomes from public, anon, authenticated, service_role;

revoke all on sequence public.course_learning_outcomes_id_seq from public, anon, authenticated, service_role;

revoke all on table public.course_offerings from public, anon, authenticated, service_role;

revoke all on sequence public.course_offerings_id_seq from public, anon, authenticated, service_role;

revoke all on table public.course_related_courses from public, anon, authenticated, service_role;

revoke all on sequence public.course_related_courses_id_seq from public, anon, authenticated, service_role;

revoke all on table public.course_unit_options from public, anon, authenticated, service_role;

revoke all on sequence public.course_unit_options_id_seq from public, anon, authenticated, service_role;

revoke all on table public.course_version_details from public, anon, authenticated, service_role;

revoke all on table public.offering_sessions from public, anon, authenticated, service_role;

revoke all on sequence public.offering_sessions_id_seq from public, anon, authenticated, service_role;

revoke all on table public.requirement_condition_options from public, anon, authenticated, service_role;

revoke all on sequence public.requirement_condition_options_id_seq from public, anon, authenticated, service_role;

revoke all on table public.requirement_conditions from public, anon, authenticated, service_role;

revoke all on sequence public.requirement_conditions_id_seq from public, anon, authenticated, service_role;

revoke all on table public.requirement_groups from public, anon, authenticated, service_role;

revoke all on sequence public.requirement_groups_id_seq from public, anon, authenticated, service_role;

revoke all on table public.requirement_item_references from public, anon, authenticated, service_role;

revoke all on sequence public.requirement_item_references_id_seq from public, anon, authenticated, service_role;

revoke all on table public.requirement_rules from public, anon, authenticated, service_role;

revoke all on sequence public.requirement_rules_id_seq from public, anon, authenticated, service_role;

revoke all on table public.structure_snapshot_summary_fields from public, anon, authenticated, service_role;

revoke all on table public.structure_version_details from public, anon, authenticated, service_role;

revoke all on function private.can_write_catalogue() from public;

grant all on function private.can_write_catalogue() to authenticated;

revoke all on function private.course_version_projection(p_version_id bigint) from public;

revoke all on function private.enforce_catalogue_snapshot_immutability() from public;

revoke all on function private.enforce_catalogue_version_immutability() from public;

revoke all on function private.guard_archived_catalogue_item_year() from public;

revoke all on function private.guard_snapshot_child_mutation() from public;

revoke all on function private.is_published_version(p_version_id bigint) from public;

grant all on function private.is_published_version(p_version_id bigint) to anon;

grant all on function private.is_published_version(p_version_id bigint) to authenticated;

revoke all on function private.programme_offers_structure(p_programme_snapshot_id bigint, p_structure_kind text, p_structure_code text) from public;

grant all on function private.programme_offers_structure(p_programme_snapshot_id bigint, p_structure_kind text, p_structure_code text) to authenticated;

revoke all on function private.record_catalogue_publication() from public;

revoke all on function private.reject_immutable_catalogue_record_mutation() from public;

revoke all on function private.requirement_projection(p_version_id bigint) from public;

revoke all on function private.seal_published_catalogue_version() from public;

revoke all on function private.structure_version_projection(p_version_id bigint) from public;

revoke all on function private.validate_requirement_condition_option() from public;

revoke all on function private.validate_requirement_tree() from public;

revoke all on function public.unpublish_catalogue_record(p_record_id bigint) from public;

grant all on function public.unpublish_catalogue_record(p_record_id bigint) to authenticated;

grant all on function public.unpublish_catalogue_record(p_record_id bigint) to service_role;

grant all on table public.academic_structure_fees to service_role;

grant select on table public.academic_structure_fees to anon;

grant select on table public.academic_structure_fees to authenticated;

grant all on sequence public.academic_structure_fees_id_seq to service_role;

grant all on table public.academic_structure_learning_outcomes to service_role;

grant select on table public.academic_structure_learning_outcomes to anon;

grant select on table public.academic_structure_learning_outcomes to authenticated;

grant all on sequence public.academic_structure_learning_outcomes_id_seq to service_role;

grant all on table public.academic_structure_snapshot_relationships to service_role;

grant select on table public.academic_structure_snapshot_relationships to anon;

grant select on table public.academic_structure_snapshot_relationships to authenticated;

grant all on sequence public.academic_structure_snapshot_relationships_id_seq to service_role;

grant all on table public.academic_structure_snapshot_sections to service_role;

grant select on table public.academic_structure_snapshot_sections to anon;

grant select on table public.academic_structure_snapshot_sections to authenticated;

grant all on sequence public.academic_structure_snapshot_sections_id_seq to service_role;

grant all on table public.catalogue_codes to service_role;

grant select on table public.catalogue_codes to anon;

grant select on table public.catalogue_codes to authenticated;

grant all on sequence public.catalogue_codes_id_seq to service_role;

grant all on table public.catalogue_publications to service_role;

grant select on table public.catalogue_publications to anon;

grant select on table public.catalogue_publications to authenticated;

grant all on sequence public.catalogue_publications_id_seq to service_role;

grant all on table public.catalogue_records to service_role;

grant select on table public.catalogue_records to anon;

grant select on table public.catalogue_records to authenticated;

grant all on sequence public.catalogue_records_id_seq to service_role;

grant all on table public.catalogue_sources to service_role;

grant select,insert,update on table public.catalogue_sources to authenticated;

grant all on sequence public.catalogue_sources_id_seq to service_role;

grant all on table public.catalogue_version_provenance to service_role;

grant select on table public.catalogue_version_provenance to anon;

grant select on table public.catalogue_version_provenance to authenticated;

grant all on sequence public.catalogue_version_provenance_id_seq to service_role;

grant all on table public.catalogue_versions to service_role;

grant select on table public.catalogue_versions to anon;

grant select on table public.catalogue_versions to authenticated;

grant all on sequence public.catalogue_versions_id_seq to service_role;

grant all on table public.course_areas_of_interest to service_role;

grant select on table public.course_areas_of_interest to authenticated;

grant select on table public.course_areas_of_interest to anon;

grant all on sequence public.course_areas_of_interest_id_seq to service_role;

grant select,usage on sequence public.course_areas_of_interest_id_seq to authenticated;

grant all on table public.course_assessment_items to service_role;

grant select on table public.course_assessment_items to anon;

grant select on table public.course_assessment_items to authenticated;

grant all on sequence public.course_assessment_items_id_seq to service_role;

grant all on table public.course_assessment_outcomes to service_role;

grant select on table public.course_assessment_outcomes to authenticated;

grant select on table public.course_assessment_outcomes to anon;

grant all on table public.course_attributes to service_role;

grant select on table public.course_attributes to anon;

grant select on table public.course_attributes to authenticated;

grant all on sequence public.course_attributes_id_seq to service_role;

grant select,usage on sequence public.course_attributes_id_seq to authenticated;

grant all on table public.course_fees to service_role;

grant select on table public.course_fees to authenticated;

grant select on table public.course_fees to anon;

grant all on sequence public.course_fees_id_seq to service_role;

grant select,usage on sequence public.course_fees_id_seq to authenticated;

grant all on table public.course_learning_outcomes to service_role;

grant select on table public.course_learning_outcomes to anon;

grant select on table public.course_learning_outcomes to authenticated;

grant all on sequence public.course_learning_outcomes_id_seq to service_role;

grant all on table public.course_offerings to service_role;

grant select on table public.course_offerings to anon;

grant select on table public.course_offerings to authenticated;

grant all on sequence public.course_offerings_id_seq to service_role;

grant select,usage on sequence public.course_offerings_id_seq to authenticated;

grant all on table public.course_related_courses to service_role;

grant select on table public.course_related_courses to authenticated;

grant select on table public.course_related_courses to anon;

grant all on sequence public.course_related_courses_id_seq to service_role;

grant select,usage on sequence public.course_related_courses_id_seq to authenticated;

grant all on table public.course_unit_options to service_role;

grant select on table public.course_unit_options to anon;

grant select on table public.course_unit_options to authenticated;

grant all on sequence public.course_unit_options_id_seq to service_role;

grant select,usage on sequence public.course_unit_options_id_seq to authenticated;

grant all on table public.course_version_details to service_role;

grant select on table public.course_version_details to anon;

grant select on table public.course_version_details to authenticated;

grant all on table public.offering_sessions to service_role;

grant select on table public.offering_sessions to anon;

grant select on table public.offering_sessions to authenticated;

grant all on sequence public.offering_sessions_id_seq to service_role;

grant select,usage on sequence public.offering_sessions_id_seq to authenticated;

grant all on table public.requirement_condition_options to service_role;

grant select on table public.requirement_condition_options to authenticated;

grant select on table public.requirement_condition_options to anon;

grant all on sequence public.requirement_condition_options_id_seq to service_role;

grant all on table public.requirement_conditions to service_role;

grant select on table public.requirement_conditions to authenticated;

grant select on table public.requirement_conditions to anon;

grant all on sequence public.requirement_conditions_id_seq to service_role;

grant all on table public.requirement_groups to service_role;

grant select on table public.requirement_groups to authenticated;

grant select on table public.requirement_groups to anon;

grant all on sequence public.requirement_groups_id_seq to service_role;

grant all on table public.requirement_item_references to service_role;

grant select on table public.requirement_item_references to authenticated;

grant select on table public.requirement_item_references to anon;

grant all on sequence public.requirement_item_references_id_seq to service_role;

grant all on table public.requirement_rules to service_role;

grant select on table public.requirement_rules to authenticated;

grant select on table public.requirement_rules to anon;

grant all on sequence public.requirement_rules_id_seq to service_role;

grant all on table public.structure_snapshot_summary_fields to service_role;

grant select on table public.structure_snapshot_summary_fields to anon;

grant select on table public.structure_snapshot_summary_fields to authenticated;

grant all on table public.structure_version_details to service_role;

grant select on table public.structure_version_details to anon;

grant select on table public.structure_version_details to authenticated;
