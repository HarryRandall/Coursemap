begin;

alter table public.catalogue_extractions
  alter column input_tokens drop not null,
  alter column input_tokens drop default,
  alter column cached_input_tokens drop not null,
  alter column cached_input_tokens drop default,
  alter column output_tokens drop not null,
  alter column output_tokens drop default,
  alter column reasoning_tokens drop not null,
  alter column reasoning_tokens drop default,
  alter column cost_usd drop not null,
  alter column cost_usd drop default;

-- The source flag establishes that these costs were never reported.
-- Legacy zero token counts have no such flag and cannot safely be inferred.
update public.catalogue_extractions
set cost_usd = null, cost_source = 'unknown'
where cost_source = 'unknown'
  -- Older retries could overwrite their own paid cost as a cache hit.
  -- A genuine cache hit retains the identity of the response it reused.
  or (cost_source = 'cache' and reused_from_extraction_id is null);

commit;
