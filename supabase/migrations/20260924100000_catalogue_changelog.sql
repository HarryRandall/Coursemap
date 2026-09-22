begin;

-- A source decision event names the review row it answered, so the changelog
-- can say which field was used or kept without matching events to review rows
-- by timestamp. Keeping current changes no content, so there is no field
-- change row to carry that meaning.
alter table public.catalogue_change_events
  add column sync_change_id bigint
    references public.catalogue_sync_changes (id) on delete set null,
  add constraint catalogue_change_events_sync_change_check check (
    sync_change_id is null
      or event_kind in ('source_accepted', 'source_kept')
  );

create index catalogue_change_events_sync_change_idx
  on public.catalogue_change_events (sync_change_id)
  where sync_change_id is not null;

comment on column public.catalogue_change_events.sync_change_id is
  'The ANU review row this event decided, for source_accepted and source_kept events.';

commit;
