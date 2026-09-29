begin;

alter table public.catalogue_extractions
  add column request_outcome text default 'pending' not null,
  add column provider_http_status integer;

update public.catalogue_extractions
set request_outcome = 'response'
where response_artifact_id is not null;

-- A model-stage HTTP error proves the provider rejected that exact attempt.
-- A missing response without that evidence remains pending and uncertain.
update public.catalogue_extractions as extractions
set request_outcome = 'rejected',
    provider_http_status = right(stages.error_code, 3)::integer
from public.catalogue_sync_stages as stages
where extractions.response_artifact_id is null
  and stages.sync_id = extractions.sync_id
  and stages.attempt_number = extractions.extraction_number
  and stages.stage_name = 'model_extract'
  and stages.status = 'failed'
  and stages.error_code ~ '^OPENROUTER_HTTP_[45][0-9]{2}$';

update public.catalogue_extractions as extractions
set request_outcome = 'not_sent'
from public.catalogue_sync_stages as stages
where extractions.response_artifact_id is null
  and stages.sync_id = extractions.sync_id
  and stages.attempt_number = extractions.extraction_number
  and stages.stage_name = 'model_extract'
  and stages.status = 'failed'
  and stages.error_code = 'OPENROUTER_NOT_CONFIGURED';

alter table public.catalogue_extractions
  add constraint catalogue_extractions_request_outcome_check
    check (request_outcome in ('pending', 'response', 'rejected', 'not_sent')),
  add constraint catalogue_extractions_provider_http_status_check
    check (
      (request_outcome = 'rejected' and provider_http_status is not null
        and provider_http_status between 400 and 599)
      or (request_outcome <> 'rejected' and provider_http_status is null)
    );

commit;
