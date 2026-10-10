-- Source versions are resolved once per current review, including decided rows.
create index catalogue_versions_sync_idx
    on public.catalogue_versions (sync_id)
    where sync_id is not null;

create index catalogue_sync_changes_current_record_position_idx
    on public.catalogue_sync_changes (record_id, position)
    where superseded_at is null;

-- Public code visibility checks need only the live publication for a code.
create index catalogue_records_live_code_idx
    on public.catalogue_records (code_id)
    where published_version_id is not null and archived_at is null;

-- Detail projections filter these children by version, not by rule or item.
create index requirement_condition_options_version_idx
    on public.requirement_condition_options (version_id);

create index requirement_item_references_version_idx
    on public.requirement_item_references (version_id);

create index course_assessment_outcomes_version_idx
    on public.course_assessment_outcomes (version_id);
