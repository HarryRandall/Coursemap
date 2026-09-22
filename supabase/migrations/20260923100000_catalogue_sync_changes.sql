begin;

-- ANU observations waiting for a decision. Distinct from
-- catalogue_field_changes, which audits what happened locally: a sync change
-- is a comparison of the previous ANU value, the local value and the new ANU
-- value that nobody has answered yet.
create table public.catalogue_sync_changes (
  id bigint generated always as identity primary key,
  sync_id uuid not null references public.catalogue_syncs (id) on delete cascade,
  record_id bigint not null references public.catalogue_records (id) on delete cascade,
  field_path text not null,
  review_unit_kind text not null,
  classification text not null,
  base_source_value jsonb,
  local_value jsonb,
  incoming_source_value jsonb,
  local_value_hash text not null,
  decision text,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  superseded_at timestamptz,
  position integer not null,
  created_at timestamptz not null default now(),
  constraint catalogue_sync_changes_unit_unique unique (sync_id, field_path),
  constraint catalogue_sync_changes_path_check check (btrim(field_path) <> ''),
  constraint catalogue_sync_changes_unit_kind_check
    check (review_unit_kind in ('scalar', 'collection', 'requirement_rule')),
  constraint catalogue_sync_changes_classification_check check (
    classification in ('source_change', 'local_override', 'conflict', 'converged')
  ),
  constraint catalogue_sync_changes_decision_check
    check (decision is null or decision in ('use_source', 'keep_local')),
  constraint catalogue_sync_changes_resolution_check
    check ((decision is null) = (resolved_at is null)),
  constraint catalogue_sync_changes_hash_check
    check (local_value_hash ~ '^[0-9a-f]{64}$'),
  constraint catalogue_sync_changes_position_check check (position >= 0)
);

-- The Changes tab and the directory both ask for the open review of a record.
create index catalogue_sync_changes_open_idx
  on public.catalogue_sync_changes (record_id, classification)
  where decision is null and superseded_at is null;

create index catalogue_sync_changes_sync_idx
  on public.catalogue_sync_changes (sync_id, position);

alter table public.catalogue_sync_changes enable row level security;

create policy catalogue_sync_changes_read
on public.catalogue_sync_changes
for select
to authenticated
using ((select private.can_read_catalogue_drafts()));

-- Resolution runs through the catalogue draft service, which holds the same
-- catalogue.write gate as every other draft mutation. No end-user role writes
-- this table directly.
grant select on table public.catalogue_sync_changes to authenticated;
grant select, insert, update, delete on table public.catalogue_sync_changes to service_role;
grant usage, select on sequence public.catalogue_sync_changes_id_seq to service_role;

alter table public.catalogue_change_events
  drop constraint catalogue_change_events_kind_check,
  add constraint catalogue_change_events_kind_check
    check (event_kind in (
      'edit', 'publish', 'unpublish', 'discard', 'restore',
      'source_draft_created', 'source_checked', 'source_changed', 'sync_failed',
      'source_accepted', 'source_kept'
    ));

comment on table public.catalogue_sync_changes is
  'Three-way ANU comparisons for one record sync, awaiting an administrator decision.';
comment on column public.catalogue_sync_changes.local_value_hash is
  'The local value when the row was generated, so a later edit to the same path is detected without invalidating the whole review.';
comment on column public.catalogue_sync_changes.superseded_at is
  'Set when a later sync generated the record''s current review. One record has one current review.';

commit;
