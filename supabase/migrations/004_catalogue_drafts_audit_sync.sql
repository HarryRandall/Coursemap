-- Coursemap baseline, part 4 of 8: drafts, audit and synchronisation
--
-- The mutable side. A draft is the one working aggregate for a record;
-- change events and field changes record what happened to it locally; syncs,
-- source pages and source documents record what ANU returned; and sync
-- changes are ANU observations waiting for a decision.
--
-- Field changes answer what we did. Sync changes answer what ANU did.
-- Keeping them apart is what lets a conflict be told from an ordinary edit.

create table if not exists public.catalogue_change_events (
    id bigint not null,
    record_id bigint not null,
    draft_revision bigint,
    event_kind text not null,
    origin text not null,
    actor_id uuid,
    editing_session_id uuid,
    version_id bigint,
    created_at timestamp with time zone default now() not null,
    sync_change_id bigint,
    constraint catalogue_change_events_kind_check check ((event_kind = any (array['edit'::text, 'publish'::text, 'unpublish'::text, 'discard'::text, 'restore'::text, 'source_draft_created'::text, 'source_checked'::text, 'source_changed'::text, 'sync_failed'::text, 'source_accepted'::text, 'source_kept'::text]))),
    constraint catalogue_change_events_origin_check check ((origin = any (array['manual'::text, 'source'::text]))),
    constraint catalogue_change_events_revision_check check (((draft_revision is null) or (draft_revision >= 0))),
    constraint catalogue_change_events_sync_change_check check (((sync_change_id is null) or (event_kind = any (array['source_accepted'::text, 'source_kept'::text]))))
);

create table if not exists public.catalogue_listings (
    id bigint not null,
    academic_year_id bigint not null,
    kind text not null,
    code text not null,
    title text,
    code_id bigint not null,
    source_page_id bigint,
    summary jsonb default '{}'::jsonb not null,
    is_current boolean default true not null,
    first_seen_at timestamp with time zone default now() not null,
    last_seen_at timestamp with time zone default now() not null,
    record_id bigint not null,
    constraint catalogue_listings_kind_check check ((kind = any (array['course'::text, 'programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text]))),
    constraint catalogue_listings_summary_check check ((jsonb_typeof(summary) = 'object'::text))
);

create table if not exists public.catalogue_discovery_check_source_pages (
    discovery_check_id bigint not null,
    source_page_id bigint not null
);

create table if not exists public.catalogue_discovery_checks (
    id bigint not null,
    academic_year_id bigint not null,
    kind text not null,
    source text default 'anu'::text not null,
    status text not null,
    is_complete boolean default false not null,
    discovered_count integer default 0 not null,
    source_page_id bigint,
    error_code text,
    error_message text,
    started_at timestamp with time zone default now() not null,
    completed_at timestamp with time zone,
    constraint catalogue_discovery_checks_count_check check ((discovered_count >= 0)),
    constraint catalogue_discovery_checks_kind_check check ((kind = any (array['course'::text, 'programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text]))),
    constraint catalogue_discovery_checks_status_check check ((status = any (array['running'::text, 'completed'::text, 'failed'::text])))
);

create table if not exists public.catalogue_discovery_statuses (
    academic_year_id bigint not null,
    kind text not null,
    status text default 'never'::text not null,
    entry_count integer default 0 not null,
    refreshed_at timestamp with time zone,
    message text,
    constraint catalogue_discovery_statuses_kind_check check ((kind = any (array['course'::text, 'programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text]))),
    constraint catalogue_discovery_statuses_status_check check ((status = any (array['never'::text, 'refreshing'::text, 'available'::text, 'failed'::text])))
);

create table if not exists public.catalogue_draft_provenance (
    record_id bigint not null,
    field_path text not null,
    origin text not null,
    source_version_id bigint,
    source_evidence_id bigint,
    changed_by uuid,
    changed_at timestamp with time zone default now() not null,
    constraint catalogue_draft_provenance_origin_check check ((origin = any (array['deterministic'::text, 'model'::text, 'manual'::text]))),
    constraint catalogue_draft_provenance_path_check check ((btrim(field_path) <> ''::text)),
    constraint catalogue_draft_provenance_source_check check ((((source_evidence_id is null) or (source_version_id is not null)) and ((origin = 'manual'::text) or (source_version_id is not null))))
);

create table if not exists public.catalogue_drafts (
    record_id bigint not null,
    base_version_id bigint,
    restored_from_version_id bigint,
    content jsonb not null,
    content_hash text not null,
    content_schema_version integer default 1 not null,
    revision bigint default 0 not null,
    updated_by uuid,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint catalogue_drafts_content_hash_check check ((content_hash ~ '^[0-9a-f]{64}$'::text)),
    constraint catalogue_drafts_content_object_check check ((jsonb_typeof(content) = 'object'::text)),
    constraint catalogue_drafts_revision_check check ((revision >= 0)),
    constraint catalogue_drafts_schema_version_check check ((content_schema_version > 0))
);

create table if not exists public.catalogue_extractions (
    id uuid default gen_random_uuid() not null,
    sync_id uuid not null,
    extraction_number integer not null,
    requested_model text not null,
    resolved_model text,
    fingerprint text not null,
    prompt_version text not null,
    schema_version text not null,
    request_artifact_id uuid not null,
    response_artifact_id uuid,
    validated_artifact_id uuid,
    reused_from_extraction_id uuid,
    provider_request_id text,
    finish_reason text,
    input_tokens integer default 0 not null,
    cached_input_tokens integer default 0 not null,
    output_tokens integer default 0 not null,
    reasoning_tokens integer default 0 not null,
    cost_usd numeric(12,6) default 0 not null,
    cost_source text default 'unknown'::text not null,
    latency_ms integer,
    validation_status text default 'pending'::text not null,
    schema_valid boolean,
    domain_valid boolean,
    warning_count integer default 0 not null,
    error_count integer default 0 not null,
    started_at timestamp with time zone default now() not null,
    completed_at timestamp with time zone,
    error_summary text,
    constraint catalogue_extractions_cost_source_check check ((cost_source = any (array['provider'::text, 'cache'::text, 'unknown'::text]))),
    constraint catalogue_extractions_fingerprint_check check ((fingerprint ~ '^[0-9a-f]{64}$'::text)),
    constraint catalogue_extractions_validation_status_check check ((validation_status = any (array['pending'::text, 'valid'::text, 'invalid'::text])))
);

create table if not exists public.catalogue_field_changes (
    event_id bigint not null,
    position integer not null,
    field_path text not null,
    old_value jsonb,
    new_value jsonb,
    constraint catalogue_field_changes_path_check check ((btrim(field_path) <> ''::text)),
    constraint catalogue_field_changes_position_check check ((position >= 0))
);

create table if not exists public.catalogue_source_documents (
    id bigint not null,
    public_id uuid default gen_random_uuid() not null,
    source_id bigint not null,
    record_id bigint not null,
    academic_year_id bigint not null,
    kind text not null,
    external_key text not null,
    canonical_url text not null,
    media_type text default 'text/html'::text not null,
    content_sha256 text not null,
    http_status integer,
    http_etag text,
    source_last_modified timestamp with time zone,
    fetched_at timestamp with time zone not null,
    byte_size integer,
    storage_bucket text,
    storage_path text,
    created_at timestamp with time zone default now() not null,
    constraint catalogue_source_documents_kind_check check ((kind = any (array['course'::text, 'programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text]))),
    constraint catalogue_source_documents_sha_check check ((content_sha256 ~ '^[0-9a-f]{64}$'::text)),
    constraint catalogue_source_documents_size_check check (((byte_size is null) or (byte_size >= 0))),
    constraint catalogue_source_documents_storage_check check (((storage_bucket is null) = (storage_path is null)))
);

create table if not exists public.catalogue_source_pages (
    id bigint not null,
    source_id bigint not null,
    academic_year_id bigint not null,
    kind text not null,
    external_key text not null,
    canonical_url text not null,
    media_type text default 'text/html'::text not null,
    content_sha256 text not null,
    http_status smallint,
    http_etag text,
    source_last_modified timestamp with time zone,
    fetched_at timestamp with time zone default now() not null,
    byte_size bigint,
    storage_bucket text,
    storage_path text,
    created_at timestamp with time zone default now() not null,
    constraint catalogue_source_pages_byte_size_check check (((byte_size is null) or (byte_size >= 0))),
    constraint catalogue_source_pages_canonical_url_check check ((canonical_url ~ '^https://[^[:space:]]+$'::text)),
    constraint catalogue_source_pages_content_sha256_check check ((content_sha256 ~ '^[0-9a-f]{64}$'::text)),
    constraint catalogue_source_pages_external_key_not_blank_check check ((btrim(external_key) <> ''::text)),
    constraint catalogue_source_pages_kind_check check ((kind = any (array['calendar'::text, 'directory'::text, 'course'::text, 'programme'::text, 'major'::text, 'minor'::text, 'specialisation'::text]))),
    constraint catalogue_source_pages_media_type_not_blank_check check ((btrim(media_type) <> ''::text)),
    constraint catalogue_source_pages_storage_check check (((storage_bucket is null) = (storage_path is null)))
);

create table if not exists public.catalogue_sync_artifacts (
    id uuid default gen_random_uuid() not null,
    sync_id uuid not null,
    stage_id uuid not null,
    kind text not null,
    attempt_number integer not null,
    media_type text not null,
    content_sha256 text not null,
    byte_size integer not null,
    storage_bucket text not null,
    storage_path text not null,
    created_at timestamp with time zone default now() not null,
    constraint catalogue_sync_artifacts_kind_check check ((kind = any (array['raw_html'::text, 'normalised_markdown'::text, 'model_input'::text, 'deterministic_output'::text, 'model_request'::text, 'model_response'::text, 'validated_json'::text, 'validation_report'::text, 'content_projection'::text]))),
    constraint catalogue_sync_artifacts_sha_check check ((content_sha256 ~ '^[0-9a-f]{64}$'::text)),
    constraint catalogue_sync_artifacts_size_check check ((byte_size >= 0))
);

create table if not exists public.catalogue_sync_changes (
    id bigint not null,
    sync_id uuid not null,
    record_id bigint not null,
    field_path text not null,
    review_unit_kind text not null,
    classification text not null,
    base_source_value jsonb,
    local_value jsonb,
    incoming_source_value jsonb,
    local_value_hash text not null,
    decision text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_note text,
    superseded_at timestamp with time zone,
    position integer not null,
    created_at timestamp with time zone default now() not null,
    constraint catalogue_sync_changes_classification_check check ((classification = any (array['source_change'::text, 'local_override'::text, 'conflict'::text, 'converged'::text]))),
    constraint catalogue_sync_changes_decision_check check (((decision is null) or (decision = any (array['use_source'::text, 'keep_local'::text])))),
    constraint catalogue_sync_changes_hash_check check ((local_value_hash ~ '^[0-9a-f]{64}$'::text)),
    constraint catalogue_sync_changes_path_check check ((btrim(field_path) <> ''::text)),
    constraint catalogue_sync_changes_position_check check ((position >= 0)),
    constraint catalogue_sync_changes_resolution_check check (((decision is null) = (resolved_at is null))),
    constraint catalogue_sync_changes_unit_kind_check check ((review_unit_kind = any (array['scalar'::text, 'collection'::text, 'requirement_rule'::text])))
);

create table if not exists public.catalogue_sync_stages (
    id uuid default gen_random_uuid() not null,
    sync_id uuid not null,
    stage_name text not null,
    attempt_number integer not null,
    status text default 'running'::text not null,
    started_at timestamp with time zone default statement_timestamp() not null,
    completed_at timestamp with time zone,
    error_code text,
    error_summary text,
    constraint catalogue_sync_stages_name_check check ((stage_name = any (array['source_fetch'::text, 'html_capture'::text, 'markdown_normalise'::text, 'model_input_prepare'::text, 'deterministic_extract'::text, 'model_extract'::text, 'schema_validate'::text, 'domain_validate'::text, 'content_project'::text, 'source_version_persist'::text]))),
    constraint catalogue_sync_stages_status_check check ((status = any (array['running'::text, 'completed'::text, 'failed'::text])))
);

create table if not exists public.catalogue_syncs (
    id uuid default gen_random_uuid() not null,
    public_id uuid default gen_random_uuid() not null,
    record_id bigint not null,
    trigger text not null,
    status text default 'queued'::text not null,
    requested_model text not null,
    parser_version text not null,
    prompt_version text not null,
    schema_version text not null,
    previous_source_version_id bigint,
    source_version_id bigint,
    source_document_id bigint,
    requested_by uuid,
    requested_at timestamp with time zone default now() not null,
    started_at timestamp with time zone,
    checked_at timestamp with time zone,
    completed_at timestamp with time zone,
    attempt_count integer default 0 not null,
    lock_version integer default 0 not null,
    worker_id uuid,
    lease_expires_at timestamp with time zone,
    queue_message_id text,
    dispatched_at timestamp with time zone,
    error_code text,
    error_message text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint catalogue_syncs_attempts_check check (((attempt_count >= 0) and (attempt_count <= 5))),
    constraint catalogue_syncs_status_check check ((status = any (array['queued'::text, 'running'::text, 'unchanged'::text, 'review_required'::text, 'applied'::text, 'failed'::text, 'cancelled'::text]))),
    constraint catalogue_syncs_trigger_check check ((trigger = any (array['manual'::text, 'scheduled'::text]))),
    constraint catalogue_syncs_versions_check check (((btrim(parser_version) <> ''::text) and (btrim(prompt_version) <> ''::text) and (btrim(schema_version) <> ''::text)))
);

alter table public.catalogue_change_events ALTER column id add generated always as identity (
    sequence NAME public.catalogue_change_events_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_discovery_checks ALTER column id add generated always as identity (
    sequence NAME public.catalogue_discovery_checks_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_listings ALTER column id add generated always as identity (
    sequence NAME public.catalogue_listings_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_source_documents ALTER column id add generated always as identity (
    sequence NAME public.catalogue_source_documents_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_source_pages ALTER column id add generated always as identity (
    sequence NAME public.catalogue_source_pages_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.catalogue_sync_changes ALTER column id add generated always as identity (
    sequence NAME public.catalogue_sync_changes_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table only public.catalogue_change_events
    add constraint catalogue_change_events_pkey primary key (id);

alter table only public.catalogue_listings
    add constraint catalogue_directory_entries_pkey primary key (id);

alter table only public.catalogue_discovery_check_source_pages
    add constraint catalogue_discovery_check_source_pages_pkey primary key (discovery_check_id, source_page_id);

alter table only public.catalogue_discovery_checks
    add constraint catalogue_discovery_checks_pkey primary key (id);

alter table only public.catalogue_discovery_statuses
    add constraint catalogue_discovery_statuses_pkey primary key (academic_year_id, kind);

alter table only public.catalogue_draft_provenance
    add constraint catalogue_draft_provenance_pkey primary key (record_id, field_path);

alter table only public.catalogue_drafts
    add constraint catalogue_drafts_pkey primary key (record_id);

alter table only public.catalogue_extractions
    add constraint catalogue_extractions_pkey primary key (id);

alter table only public.catalogue_extractions
    add constraint catalogue_extractions_sync_number_unique unique (sync_id, extraction_number);

alter table only public.catalogue_field_changes
    add constraint catalogue_field_changes_pkey primary key (event_id, position);

alter table only public.catalogue_listings
    add constraint catalogue_listings_unique unique (academic_year_id, kind, code);

alter table only public.catalogue_source_documents
    add constraint catalogue_source_documents_id_record_unique unique (id, record_id);

alter table only public.catalogue_source_documents
    add constraint catalogue_source_documents_identity_unique unique (source_id, record_id, content_sha256);

alter table only public.catalogue_source_documents
    add constraint catalogue_source_documents_pkey primary key (id);

alter table only public.catalogue_source_documents
    add constraint catalogue_source_documents_public_id_unique unique (public_id);

alter table only public.catalogue_source_pages
    add constraint catalogue_source_pages_content_unique unique (source_id, academic_year_id, kind, external_key, content_sha256);

alter table only public.catalogue_source_pages
    add constraint catalogue_source_pages_id_year_unique unique (id, academic_year_id);

alter table only public.catalogue_source_pages
    add constraint catalogue_source_pages_pkey primary key (id);

alter table only public.catalogue_sync_artifacts
    add constraint catalogue_sync_artifacts_pkey primary key (id);

alter table only public.catalogue_sync_changes
    add constraint catalogue_sync_changes_pkey primary key (id);

alter table only public.catalogue_sync_changes
    add constraint catalogue_sync_changes_unit_unique unique (sync_id, field_path);

alter table only public.catalogue_sync_stages
    add constraint catalogue_sync_stages_pkey primary key (id);

alter table only public.catalogue_sync_stages
    add constraint catalogue_sync_stages_unique unique (sync_id, stage_name, attempt_number);

alter table only public.catalogue_syncs
    add constraint catalogue_syncs_pkey primary key (id);

alter table only public.catalogue_syncs
    add constraint catalogue_syncs_public_id_unique unique (public_id);

alter table only public.catalogue_change_events
    add constraint catalogue_change_events_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null;

alter table only public.catalogue_change_events
    add constraint catalogue_change_events_record_id_fkey foreign key (record_id) references public.catalogue_records(id) on delete cascade;

alter table only public.catalogue_change_events
    add constraint catalogue_change_events_sync_change_id_fkey foreign key (sync_change_id) references public.catalogue_sync_changes(id) on delete set null;

alter table only public.catalogue_change_events
    add constraint catalogue_change_events_version_fkey foreign key (version_id, record_id) references public.catalogue_versions(id, record_id);

alter table only public.catalogue_discovery_check_source_pages
    add constraint catalogue_discovery_check_source_pages_discovery_check_id_fkey foreign key (discovery_check_id) references public.catalogue_discovery_checks(id) on delete cascade;

alter table only public.catalogue_discovery_check_source_pages
    add constraint catalogue_discovery_check_source_pages_source_page_id_fkey foreign key (source_page_id) references public.catalogue_source_pages(id);

alter table only public.catalogue_discovery_checks
    add constraint catalogue_discovery_checks_academic_year_id_fkey foreign key (academic_year_id) references public.academic_years(id);

alter table only public.catalogue_discovery_checks
    add constraint catalogue_discovery_checks_source_page_fkey foreign key (source_page_id, academic_year_id) references public.catalogue_source_pages(id, academic_year_id);

alter table only public.catalogue_discovery_statuses
    add constraint catalogue_discovery_statuses_academic_year_fkey foreign key (academic_year_id) references public.academic_years(id);

alter table only public.catalogue_draft_provenance
    add constraint catalogue_draft_provenance_changed_by_fkey foreign key (changed_by) references auth.users(id) on delete set null;

alter table only public.catalogue_draft_provenance
    add constraint catalogue_draft_provenance_record_id_fkey foreign key (record_id) references public.catalogue_drafts(record_id) on delete cascade;

alter table only public.catalogue_draft_provenance
    add constraint catalogue_draft_provenance_source_evidence_fkey foreign key (source_evidence_id) references public.catalogue_version_provenance(id) on delete cascade;

alter table only public.catalogue_draft_provenance
    add constraint catalogue_draft_provenance_source_version_fkey foreign key (source_version_id, record_id) references public.catalogue_versions(id, record_id) on delete cascade;

alter table only public.catalogue_drafts
    add constraint catalogue_drafts_base_version_fkey foreign key (base_version_id, record_id) references public.catalogue_versions(id, record_id);

alter table only public.catalogue_drafts
    add constraint catalogue_drafts_record_id_fkey foreign key (record_id) references public.catalogue_records(id) on delete cascade;

alter table only public.catalogue_drafts
    add constraint catalogue_drafts_restored_version_fkey foreign key (restored_from_version_id, record_id) references public.catalogue_versions(id, record_id);

alter table only public.catalogue_drafts
    add constraint catalogue_drafts_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table only public.catalogue_extractions
    add constraint catalogue_extractions_request_artifact_id_fkey foreign key (request_artifact_id) references public.catalogue_sync_artifacts(id);

alter table only public.catalogue_extractions
    add constraint catalogue_extractions_response_artifact_id_fkey foreign key (response_artifact_id) references public.catalogue_sync_artifacts(id);

alter table only public.catalogue_extractions
    add constraint catalogue_extractions_reused_from_extraction_id_fkey foreign key (reused_from_extraction_id) references public.catalogue_extractions(id);

alter table only public.catalogue_extractions
    add constraint catalogue_extractions_sync_id_fkey foreign key (sync_id) references public.catalogue_syncs(id) on delete cascade;

alter table only public.catalogue_extractions
    add constraint catalogue_extractions_validated_artifact_id_fkey foreign key (validated_artifact_id) references public.catalogue_sync_artifacts(id);

alter table only public.catalogue_field_changes
    add constraint catalogue_field_changes_event_id_fkey foreign key (event_id) references public.catalogue_change_events(id) on delete cascade;

alter table only public.catalogue_listings
    add constraint catalogue_listings_academic_year_fkey foreign key (academic_year_id) references public.academic_years(id);

alter table only public.catalogue_listings
    add constraint catalogue_listings_code_fkey foreign key (code_id, kind) references public.catalogue_codes(id, kind);

alter table only public.catalogue_listings
    add constraint catalogue_listings_record_fkey foreign key (record_id, academic_year_id) references public.catalogue_records(id, academic_year_id);

alter table only public.catalogue_listings
    add constraint catalogue_listings_source_page_fkey foreign key (source_page_id, academic_year_id) references public.catalogue_source_pages(id, academic_year_id);

alter table only public.catalogue_source_documents
    add constraint catalogue_source_documents_academic_year_id_fkey foreign key (academic_year_id) references public.academic_years(id);

alter table only public.catalogue_source_documents
    add constraint catalogue_source_documents_record_id_fkey foreign key (record_id) references public.catalogue_records(id) on delete cascade;

alter table only public.catalogue_source_documents
    add constraint catalogue_source_documents_record_kind_fkey foreign key (record_id, kind) references public.catalogue_records(id, kind) on delete cascade;

alter table only public.catalogue_source_documents
    add constraint catalogue_source_documents_record_year_fkey foreign key (record_id, academic_year_id) references public.catalogue_records(id, academic_year_id) on delete cascade;

alter table only public.catalogue_source_documents
    add constraint catalogue_source_documents_source_id_fkey foreign key (source_id) references public.catalogue_sources(id);

alter table only public.catalogue_source_pages
    add constraint catalogue_source_pages_academic_year_id_fkey foreign key (academic_year_id) references public.academic_years(id);

alter table only public.catalogue_source_pages
    add constraint catalogue_source_pages_source_id_fkey foreign key (source_id) references public.catalogue_sources(id);

alter table only public.catalogue_sync_artifacts
    add constraint catalogue_sync_artifacts_stage_id_fkey foreign key (stage_id) references public.catalogue_sync_stages(id) on delete cascade;

alter table only public.catalogue_sync_artifacts
    add constraint catalogue_sync_artifacts_sync_id_fkey foreign key (sync_id) references public.catalogue_syncs(id) on delete cascade;

alter table only public.catalogue_sync_changes
    add constraint catalogue_sync_changes_record_id_fkey foreign key (record_id) references public.catalogue_records(id) on delete cascade;

alter table only public.catalogue_sync_changes
    add constraint catalogue_sync_changes_resolved_by_fkey foreign key (resolved_by) references auth.users(id) on delete set null;

alter table only public.catalogue_sync_changes
    add constraint catalogue_sync_changes_sync_id_fkey foreign key (sync_id) references public.catalogue_syncs(id) on delete cascade;

alter table only public.catalogue_sync_stages
    add constraint catalogue_sync_stages_sync_id_fkey foreign key (sync_id) references public.catalogue_syncs(id) on delete cascade;

alter table only public.catalogue_syncs
    add constraint catalogue_syncs_previous_source_version_fkey foreign key (previous_source_version_id, record_id) references public.catalogue_versions(id, record_id);

alter table only public.catalogue_syncs
    add constraint catalogue_syncs_record_id_fkey foreign key (record_id) references public.catalogue_records(id) on delete cascade;

alter table only public.catalogue_syncs
    add constraint catalogue_syncs_requested_by_fkey foreign key (requested_by) references auth.users(id) on delete set null;

alter table only public.catalogue_syncs
    add constraint catalogue_syncs_requested_model_fkey foreign key (requested_model) references public.import_models(id);

alter table only public.catalogue_syncs
    add constraint catalogue_syncs_source_document_fkey foreign key (source_document_id, record_id) references public.catalogue_source_documents(id, record_id);

alter table only public.catalogue_syncs
    add constraint catalogue_syncs_source_version_fkey foreign key (source_version_id, record_id) references public.catalogue_versions(id, record_id);

alter table only public.catalogue_version_provenance
    add constraint catalogue_version_provenance_source_document_id_fkey foreign key (source_document_id) references public.catalogue_source_documents(id);

alter table only public.catalogue_version_provenance
    add constraint catalogue_version_provenance_source_page_fkey foreign key (source_page_id, academic_year_id) references public.catalogue_source_pages(id, academic_year_id);

alter table only public.catalogue_versions
    add constraint catalogue_versions_source_document_fkey foreign key (source_document_id, record_id) references public.catalogue_source_documents(id, record_id);

alter table only public.catalogue_versions
    add constraint catalogue_versions_sync_fkey foreign key (sync_id) references public.catalogue_syncs(id) on delete set null;

alter table only public.course_offerings
    add constraint course_offerings_source_page_year_fkey foreign key (source_page_id, academic_year_id) references public.catalogue_source_pages(id, academic_year_id);

alter table only public.offering_sessions
    add constraint offering_sessions_source_page_year_fkey foreign key (source_page_id, academic_year_id) references public.catalogue_source_pages(id, academic_year_id);

alter table only public.requirement_rules
    add constraint requirement_rules_source_page_fkey foreign key (source_page_id, academic_year_id) references public.catalogue_source_pages(id, academic_year_id);

alter table only public.university_calendar_events
    add constraint university_calendar_events_source_page_id_fkey foreign key (source_page_id) references public.catalogue_source_pages(id);

alter table only public.university_calendar_imports
    add constraint university_calendar_imports_source_page_id_fkey foreign key (source_page_id) references public.catalogue_source_pages(id);

create index catalogue_change_events_record_created_idx on public.catalogue_change_events using btree (record_id, created_at desc, id desc);

create index catalogue_change_events_session_idx on public.catalogue_change_events using btree (editing_session_id, created_at) where (editing_session_id is not null);

create index catalogue_change_events_sync_change_idx on public.catalogue_change_events using btree (sync_change_id) where (sync_change_id is not null);

create index catalogue_discovery_check_source_pages_page_idx on public.catalogue_discovery_check_source_pages using btree (source_page_id);

create index catalogue_discovery_checks_recent_idx on public.catalogue_discovery_checks using btree (academic_year_id, kind, started_at desc);

create index catalogue_extractions_fingerprint_idx on public.catalogue_extractions using btree (fingerprint, validation_status);

create index catalogue_field_changes_path_idx on public.catalogue_field_changes using btree (field_path, event_id);

create index catalogue_listings_lookup_idx on public.catalogue_listings using btree (academic_year_id, kind, is_current, code);

create index catalogue_listings_record_idx on public.catalogue_listings using btree (record_id);

create index catalogue_source_documents_record_idx on public.catalogue_source_documents using btree (record_id, fetched_at desc);

create index catalogue_source_pages_academic_year_kind_idx on public.catalogue_source_pages using btree (academic_year_id, kind, external_key);

create index catalogue_source_pages_source_id_idx on public.catalogue_source_pages using btree (source_id);

create index catalogue_sync_artifacts_sync_idx on public.catalogue_sync_artifacts using btree (sync_id, created_at);

create index catalogue_sync_changes_open_idx on public.catalogue_sync_changes using btree (record_id, classification) where ((decision is null) and (superseded_at is null));

create index catalogue_sync_changes_sync_idx on public.catalogue_sync_changes using btree (sync_id, position);

create index catalogue_sync_stages_sync_idx on public.catalogue_sync_stages using btree (sync_id, started_at);

create unique index catalogue_syncs_active_record_idx on public.catalogue_syncs using btree (record_id) where (status = any (array['queued'::text, 'running'::text]));

create index catalogue_syncs_lease_idx on public.catalogue_syncs using btree (status, lease_expires_at);

create index catalogue_syncs_record_idx on public.catalogue_syncs using btree (record_id, created_at desc);

create or replace function private.can_read_catalogue_drafts() returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
  select private.has_permission('catalogue.read_drafts')
    or private.has_permission('courses.read_drafts')
    or private.has_permission('catalogue.write')
    or private.has_permission('courses.write')
    or private.has_permission('imports.manage');
$$;

create or replace function private.notify_catalogue_sync_finished() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  record_code text;
  record_kind text;
  record_year smallint;
  record_path text;
  change_count integer;
begin
  -- Only a person who asked has an inbox to tell. Scheduled work reports
  -- through operations instead.
  if new.requested_by is null then
    return new;
  end if;

  select codes.code, records.kind, years.year
  into record_code, record_kind, record_year
  from public.catalogue_records as records
  join public.catalogue_codes as codes on codes.id = records.code_id
  join public.academic_years as years on years.id = records.academic_year_id
  where records.id = new.record_id;

  record_path := '/admin/' || case record_kind
    when 'course' then 'courses'
    when 'programme' then 'programmes'
    when 'major' then 'majors'
    when 'minor' then 'minors'
    else 'specialisations'
  end || '/' || record_year || '/' || lower(record_code);

  if new.status = 'failed' then
    perform private.record_notification(
      new.requested_by,
      'catalogue_sync',
      record_code || ' sync failed',
      coalesce(new.error_message, 'The ANU sync did not finish.'),
      '/admin/operations/catalogue/syncs/' || new.id::text,
      'catalogue-sync:' || new.id::text
    );
    return new;
  end if;

  select count(*) into change_count
  from public.catalogue_sync_changes as changes
  where changes.sync_id = new.id
    and changes.classification in ('source_change', 'conflict');

  if new.status = 'review_required' and coalesce(change_count, 0) > 0 then
    perform private.record_notification(
      new.requested_by,
      'catalogue_sync',
      record_code || ' has ' || change_count || ' ANU '
        || case when change_count = 1 then 'change' else 'changes' end
        || ' to review',
      'ANU published different information for ' || record_year || '.',
      record_path || '/changes',
      'catalogue-sync:' || new.id::text
    );
  end if;
  return new;
end;
$$;

create or replace function private.recover_stale_catalogue_syncs() returns integer
    language plpgsql
    set search_path to ''
    as $$
declare recovered integer;
begin
  with changed as (
    update public.catalogue_syncs
    set status = case when attempt_count >= 5 then 'failed' else 'queued' end,
        worker_id = null, lease_expires_at = null,
        error_code = case when attempt_count >= 5 then 'LEASE_EXPIRED' else error_code end,
        error_message = case when attempt_count >= 5
          then 'The worker lease expired after the final attempt.' else error_message end,
        completed_at = case when attempt_count >= 5 then now() else null end
    where status = 'running' and lease_expires_at < now()
    returning record_id, requested_by, status
  ), recorded_failures as (
    insert into public.catalogue_change_events (
      record_id, event_kind, origin, actor_id
    )
    select record_id, 'sync_failed', 'source', requested_by
    from changed where status = 'failed'
    returning id
  )
  select count(*) into recovered from changed;
  return recovered;
end;
$$;

create or replace function public.cancel_catalogue_sync(p_sync_id uuid) returns boolean
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Cancelling a catalogue sync requires the imports.manage permission.';
  end if;
  update public.catalogue_syncs
  set status = 'cancelled', worker_id = null, lease_expires_at = null,
      completed_at = now(), error_code = null, error_message = null
  where id = p_sync_id and status in ('queued', 'running');
  return found;
end;
$$;

create or replace function public.catalogue_publish_blockers(p_record_id bigint) returns text[]
    language sql stable security definer
    set search_path to ''
    as $$
  select array_remove(array[
    case when records.id is null then 'The record does not exist.' end,
    case when records.archived_at is not null then 'The record is archived.' end,
    case when records.id is not null and drafts.record_id is null
      then 'There is no draft to publish.' end
  ], null)
  from (select p_record_id as requested_id) as requested
  left join public.catalogue_records as records on records.id = requested.requested_id
  left join public.catalogue_drafts as drafts on drafts.record_id = records.id;
$$;

create or replace function public.start_catalogue_sync(p_record_id bigint, p_trigger text, p_requested_model text, p_parser_version text, p_prompt_version text, p_schema_version text) returns uuid
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  user_id uuid := (select auth.uid());
  created_sync_id uuid;
begin
  if user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not private.has_permission('imports.manage') then
    raise exception using errcode = '42501', message = 'Synchronising catalogue records requires the imports.manage permission.';
  end if;
  if p_trigger not in ('manual', 'scheduled') then
    raise exception using errcode = '22023', message = 'The sync trigger is not recognised.';
  end if;
  if not exists (select 1 from public.catalogue_records where id = p_record_id and archived_at is null) then
    raise exception using errcode = 'P0002', message = 'The catalogue record is not available for synchronisation.';
  end if;
  if not exists (select 1 from public.import_models where id = p_requested_model and enabled) then
    raise exception using errcode = '22023', message = 'Choose an enabled extraction model.';
  end if;

  insert into public.catalogue_syncs (
    record_id, trigger, requested_model, parser_version, prompt_version,
    schema_version, requested_by, previous_source_version_id
  )
  select p_record_id, p_trigger, p_requested_model, p_parser_version,
    p_prompt_version, p_schema_version, user_id, latest_source_version_id
  from public.catalogue_records where id = p_record_id
  returning id into created_sync_id;
  return created_sync_id;
exception
  when unique_violation then
    raise exception using errcode = '55000', message = 'This record is already syncing from ANU.';
end;
$$;

create or replace function public.admin_catalogue_version_projection(p_version_id bigint) returns jsonb
    language plpgsql stable security definer
    set search_path to ''
    as $$
declare
  snapshot_kind text;
begin
  if not private.can_read_catalogue_drafts() then
    raise exception using errcode = '42501', message = 'Catalogue permission is required.';
  end if;
  select kind into snapshot_kind from public.catalogue_versions where id = p_version_id;
  if snapshot_kind is null then
    raise exception using errcode = 'P0002', message = 'The snapshot does not exist.';
  end if;
  if snapshot_kind <> 'course' then
    return null;
  end if;
  return private.course_version_projection(p_version_id)
    || jsonb_build_object('snapshotId', p_version_id);
end;
$$;

comment on function private.notify_catalogue_sync_finished() is 'Tells the administrator who asked that their record needs attention.';

comment on function public.catalogue_publish_blockers(p_record_id bigint) is 'Reasons the current mutable draft cannot be published.';

create or replace trigger catalogue_source_documents_reject_mutation before delete or update on public.catalogue_source_documents for each row execute function private.reject_immutable_catalogue_record_mutation();

create or replace trigger catalogue_source_pages_reject_mutation before delete or update on public.catalogue_source_pages for each row execute function private.reject_immutable_catalogue_record_mutation();

create or replace trigger catalogue_sync_artifacts_reject_mutation before update on public.catalogue_sync_artifacts for each row execute function private.reject_immutable_catalogue_record_mutation();

create or replace trigger catalogue_syncs_notify_finished after update OF status on public.catalogue_syncs for each row when (((old.status is distinct from new.status) and (new.status = any (array['failed'::text, 'review_required'::text])))) execute function private.notify_catalogue_sync_finished();

create or replace trigger catalogue_syncs_set_updated_at before update on public.catalogue_syncs for each row execute function private.set_updated_at();

alter table public.catalogue_change_events enable row level security;

alter table public.catalogue_discovery_check_source_pages enable row level security;

alter table public.catalogue_discovery_checks enable row level security;

alter table public.catalogue_discovery_statuses enable row level security;

alter table public.catalogue_draft_provenance enable row level security;

alter table public.catalogue_drafts enable row level security;

alter table public.catalogue_extractions enable row level security;

alter table public.catalogue_field_changes enable row level security;

alter table public.catalogue_listings enable row level security;

alter table public.catalogue_source_documents enable row level security;

alter table public.catalogue_source_pages enable row level security;

alter table public.catalogue_sync_artifacts enable row level security;

alter table public.catalogue_sync_changes enable row level security;

alter table public.catalogue_sync_stages enable row level security;

alter table public.catalogue_syncs enable row level security;

create policy catalogue_change_events_read on public.catalogue_change_events for select to authenticated using (( select private.can_read_catalogue_drafts() as can_read_catalogue_drafts));

create policy catalogue_discovery_check_source_pages_admin_read on public.catalogue_discovery_check_source_pages for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_discovery_checks_admin_read on public.catalogue_discovery_checks for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_discovery_statuses_admin_read on public.catalogue_discovery_statuses for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_draft_provenance_read on public.catalogue_draft_provenance for select to authenticated using (( select private.can_read_catalogue_drafts() as can_read_catalogue_drafts));

create policy catalogue_drafts_read on public.catalogue_drafts for select to authenticated using (( select private.can_read_catalogue_drafts() as can_read_catalogue_drafts));

create policy catalogue_extractions_admin_read on public.catalogue_extractions for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_field_changes_read on public.catalogue_field_changes for select to authenticated using ((exists ( select 1
   from public.catalogue_change_events events
  where ((events.id = catalogue_field_changes.event_id) and ( select private.can_read_catalogue_drafts() as can_read_catalogue_drafts)))));

create policy catalogue_listings_admin_read on public.catalogue_listings for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_publications_read on public.catalogue_publications for select to authenticated, anon using ((((version_id is not null) and ( select private.is_published_version(catalogue_publications.version_id) as is_published_version)) or ( select private.can_read_catalogue_drafts() as can_read_catalogue_drafts)));

create policy catalogue_source_documents_admin_read on public.catalogue_source_documents for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_source_pages_import_admin_insert on public.catalogue_source_pages for insert to authenticated with check (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_source_pages_import_admin_read on public.catalogue_source_pages for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_sync_artifacts_admin_read on public.catalogue_sync_artifacts for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_sync_changes_read on public.catalogue_sync_changes for select to authenticated using (( select private.can_read_catalogue_drafts() as can_read_catalogue_drafts));

create policy catalogue_sync_stages_admin_read on public.catalogue_sync_stages for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy catalogue_syncs_admin_read on public.catalogue_syncs for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

comment on table public.catalogue_change_events is 'Append-only accepted draft and publication operations.';

comment on table public.catalogue_listings is 'ANU listing metadata for one catalogue record and academic year.';

comment on table public.catalogue_discovery_check_source_pages is 'Immutable ANU listing pages consulted by one catalogue discovery check.';

comment on table public.catalogue_discovery_checks is 'One attempt to discover ANU catalogue listings for a kind and academic year.';

comment on table public.catalogue_draft_provenance is 'Current path-specific provenance for mutable catalogue draft content.';

comment on table public.catalogue_drafts is 'One private mutable working aggregate per annual catalogue record.';

comment on table public.catalogue_field_changes is 'Stable semantic paths and exact old/new values for one change event.';

comment on table public.catalogue_source_documents is 'Immutable source material fetched from ANU for a record sync.';

comment on table public.catalogue_source_pages is 'Immutable retrieval provenance for fetched catalogue documents. Bodies are stored in the private artefact bucket.';

comment on table public.catalogue_sync_artifacts is 'Immutable technical inputs and outputs retained for a catalogue sync.';

comment on table public.catalogue_sync_changes is 'Three-way ANU comparisons for one record sync, awaiting an administrator decision.';

comment on table public.catalogue_sync_stages is 'Developer-facing execution diagnostics for catalogue synchronisation.';

comment on table public.catalogue_syncs is 'One independently queued ANU source check for one annual catalogue record.';

comment on column public.catalogue_change_events.sync_change_id is 'The ANU review row this event decided, for source_accepted and source_kept events.';

comment on column public.catalogue_sync_changes.local_value_hash is 'The local value when the row was generated, so a later edit to the same path is detected without invalidating the whole review.';

comment on column public.catalogue_sync_changes.superseded_at is 'Set when a later sync generated the record''s current review. One record has one current review.';

-- Every object is taken back to nothing before it is granted anything, so the
-- grants below are the whole of what each role holds rather than an addition
-- to whatever Supabase's defaults already handed out.

revoke all on function private.can_read_catalogue_drafts() from public, anon, authenticated, service_role;

revoke all on function private.recover_stale_catalogue_syncs() from public, anon, authenticated, service_role;

revoke all on function public.admin_catalogue_version_projection(p_version_id bigint) from public, anon, authenticated, service_role;

revoke all on function public.cancel_catalogue_sync(p_sync_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.catalogue_publish_blockers(p_record_id bigint) from public, anon, authenticated, service_role;

revoke all on function public.start_catalogue_sync(p_record_id bigint, p_trigger text, p_requested_model text, p_parser_version text, p_prompt_version text, p_schema_version text) from public, anon, authenticated, service_role;

revoke all on table public.catalogue_change_events from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_change_events_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_listings from public, anon, authenticated, service_role;

revoke all on table public.catalogue_discovery_check_source_pages from public, anon, authenticated, service_role;

revoke all on table public.catalogue_discovery_checks from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_discovery_checks_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_discovery_statuses from public, anon, authenticated, service_role;

revoke all on table public.catalogue_draft_provenance from public, anon, authenticated, service_role;

revoke all on table public.catalogue_drafts from public, anon, authenticated, service_role;

revoke all on table public.catalogue_extractions from public, anon, authenticated, service_role;

revoke all on table public.catalogue_field_changes from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_listings_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_source_documents from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_source_documents_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_source_pages from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_source_pages_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_sync_artifacts from public, anon, authenticated, service_role;

revoke all on table public.catalogue_sync_changes from public, anon, authenticated, service_role;

revoke all on sequence public.catalogue_sync_changes_id_seq from public, anon, authenticated, service_role;

revoke all on table public.catalogue_sync_stages from public, anon, authenticated, service_role;

revoke all on table public.catalogue_syncs from public, anon, authenticated, service_role;

revoke all on function private.can_read_catalogue_drafts() from public;

grant all on function private.can_read_catalogue_drafts() to anon;

grant all on function private.can_read_catalogue_drafts() to authenticated;

revoke all on function private.recover_stale_catalogue_syncs() from public;

revoke all on function public.admin_catalogue_version_projection(p_version_id bigint) from public;

grant all on function public.admin_catalogue_version_projection(p_version_id bigint) to authenticated;

grant all on function public.admin_catalogue_version_projection(p_version_id bigint) to service_role;

revoke all on function public.cancel_catalogue_sync(p_sync_id uuid) from public;

grant all on function public.cancel_catalogue_sync(p_sync_id uuid) to authenticated;

grant all on function public.cancel_catalogue_sync(p_sync_id uuid) to service_role;

revoke all on function public.catalogue_publish_blockers(p_record_id bigint) from public;

grant all on function public.catalogue_publish_blockers(p_record_id bigint) to authenticated;

grant all on function public.catalogue_publish_blockers(p_record_id bigint) to service_role;

revoke all on function public.start_catalogue_sync(p_record_id bigint, p_trigger text, p_requested_model text, p_parser_version text, p_prompt_version text, p_schema_version text) from public;

grant all on function public.start_catalogue_sync(p_record_id bigint, p_trigger text, p_requested_model text, p_parser_version text, p_prompt_version text, p_schema_version text) to authenticated;

grant all on function public.start_catalogue_sync(p_record_id bigint, p_trigger text, p_requested_model text, p_parser_version text, p_prompt_version text, p_schema_version text) to service_role;

grant all on table public.catalogue_change_events to service_role;

grant select on table public.catalogue_change_events to authenticated;

grant all on sequence public.catalogue_change_events_id_seq to service_role;

grant all on table public.catalogue_listings to service_role;

grant select on table public.catalogue_listings to authenticated;

grant all on table public.catalogue_discovery_check_source_pages to service_role;

grant select on table public.catalogue_discovery_check_source_pages to authenticated;

grant all on table public.catalogue_discovery_checks to service_role;

grant select on table public.catalogue_discovery_checks to authenticated;

grant all on sequence public.catalogue_discovery_checks_id_seq to service_role;

grant all on table public.catalogue_discovery_statuses to service_role;

grant select on table public.catalogue_discovery_statuses to authenticated;

grant all on table public.catalogue_draft_provenance to service_role;

grant select on table public.catalogue_draft_provenance to authenticated;

grant all on table public.catalogue_drafts to service_role;

grant select on table public.catalogue_drafts to authenticated;

grant all on table public.catalogue_extractions to service_role;

grant select on table public.catalogue_extractions to authenticated;

grant all on table public.catalogue_field_changes to service_role;

grant select on table public.catalogue_field_changes to authenticated;

grant all on sequence public.catalogue_listings_id_seq to service_role;

grant all on table public.catalogue_source_documents to service_role;

grant select on table public.catalogue_source_documents to authenticated;

grant all on sequence public.catalogue_source_documents_id_seq to service_role;

grant all on table public.catalogue_source_pages to service_role;

grant select,insert on table public.catalogue_source_pages to authenticated;

grant all on sequence public.catalogue_source_pages_id_seq to service_role;

grant all on table public.catalogue_sync_artifacts to service_role;

grant select on table public.catalogue_sync_artifacts to authenticated;

grant all on table public.catalogue_sync_changes to service_role;

grant select on table public.catalogue_sync_changes to authenticated;

grant all on sequence public.catalogue_sync_changes_id_seq to service_role;

grant all on table public.catalogue_sync_stages to service_role;

grant select on table public.catalogue_sync_stages to authenticated;

grant all on table public.catalogue_syncs to service_role;

grant select on table public.catalogue_syncs to authenticated;
