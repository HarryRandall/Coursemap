-- Catalogue syncs no longer run a deterministic extraction stage: the model
-- reads the whole ANU page and owns every field. The audit rows the retired
-- stage left behind describe a pipeline that no longer exists, so they are
-- removed before the stage and its artefact kind leave the allowed values.
-- Deleting a stage cascades to the artefacts it recorded.

delete from public.catalogue_sync_stages
where stage_name = 'deterministic_extract';

delete from public.catalogue_sync_artifacts
where kind = 'deterministic_output';

alter table public.catalogue_sync_stages
  drop constraint catalogue_sync_stages_name_check,
  add constraint catalogue_sync_stages_name_check check (
    stage_name = any (array[
      'source_fetch'::text,
      'html_capture'::text,
      'markdown_normalise'::text,
      'model_input_prepare'::text,
      'model_extract'::text,
      'schema_validate'::text,
      'domain_validate'::text,
      'content_project'::text,
      'source_version_persist'::text
    ])
  );

alter table public.catalogue_sync_artifacts
  drop constraint catalogue_sync_artifacts_kind_check,
  add constraint catalogue_sync_artifacts_kind_check check (
    kind = any (array[
      'raw_html'::text,
      'normalised_markdown'::text,
      'model_input'::text,
      'model_request'::text,
      'model_response'::text,
      'validated_json'::text,
      'validation_report'::text,
      'content_projection'::text
    ])
  );
