begin;

-- A draft is the one mutable working aggregate for an annual catalogue
-- record. Immutable, normalised catalogue_versions remain the only content
-- that publication and student reads can use.
create table public.catalogue_drafts (
  record_id bigint primary key,
  base_version_id bigint,
  restored_from_version_id bigint,
  content jsonb not null,
  content_hash text not null,
  content_schema_version integer not null default 1,
  revision bigint not null default 0,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogue_drafts_record_id_fkey
    foreign key (record_id) references public.catalogue_records (id) on delete cascade,
  constraint catalogue_drafts_base_version_fkey
    foreign key (base_version_id, record_id)
    references public.catalogue_versions (id, record_id),
  constraint catalogue_drafts_restored_version_fkey
    foreign key (restored_from_version_id, record_id)
    references public.catalogue_versions (id, record_id),
  constraint catalogue_drafts_updated_by_fkey
    foreign key (updated_by) references auth.users (id) on delete set null,
  constraint catalogue_drafts_content_object_check
    check (jsonb_typeof(content) = 'object'),
  constraint catalogue_drafts_content_hash_check
    check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint catalogue_drafts_schema_version_check
    check (content_schema_version > 0),
  constraint catalogue_drafts_revision_check check (revision >= 0)
);

create table public.catalogue_change_events (
  id bigint generated always as identity primary key,
  record_id bigint not null,
  draft_revision bigint,
  event_kind text not null,
  origin text not null,
  actor_id uuid,
  editing_session_id uuid,
  version_id bigint,
  created_at timestamptz not null default now(),
  constraint catalogue_change_events_record_id_fkey
    foreign key (record_id) references public.catalogue_records (id) on delete cascade,
  constraint catalogue_change_events_actor_id_fkey
    foreign key (actor_id) references auth.users (id) on delete set null,
  constraint catalogue_change_events_version_fkey
    foreign key (version_id, record_id)
    references public.catalogue_versions (id, record_id),
  constraint catalogue_change_events_kind_check
    check (event_kind in ('edit', 'publish', 'unpublish', 'discard', 'restore')),
  constraint catalogue_change_events_origin_check
    check (origin in ('manual', 'source')),
  constraint catalogue_change_events_revision_check
    check (draft_revision is null or draft_revision >= 0)
);

create index catalogue_change_events_record_created_idx
  on public.catalogue_change_events (record_id, created_at desc, id desc);

create index catalogue_change_events_session_idx
  on public.catalogue_change_events (editing_session_id, created_at)
  where editing_session_id is not null;

create table public.catalogue_field_changes (
  event_id bigint not null,
  position integer not null,
  field_path text not null,
  old_value jsonb,
  new_value jsonb,
  primary key (event_id, position),
  constraint catalogue_field_changes_event_id_fkey
    foreign key (event_id) references public.catalogue_change_events (id) on delete cascade,
  constraint catalogue_field_changes_position_check check (position >= 0),
  constraint catalogue_field_changes_path_check check (btrim(field_path) <> '')
);

create index catalogue_field_changes_path_idx
  on public.catalogue_field_changes (field_path, event_id);

create table public.catalogue_draft_provenance (
  record_id bigint not null,
  field_path text not null,
  origin text not null,
  source_version_id bigint,
  source_evidence_id bigint,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (record_id, field_path),
  constraint catalogue_draft_provenance_record_id_fkey
    foreign key (record_id) references public.catalogue_drafts (record_id) on delete cascade,
  constraint catalogue_draft_provenance_source_version_fkey
    foreign key (source_version_id, record_id)
    references public.catalogue_versions (id, record_id) on delete cascade,
  constraint catalogue_draft_provenance_source_evidence_fkey
    foreign key (source_evidence_id)
    references public.catalogue_version_provenance (id) on delete cascade,
  constraint catalogue_draft_provenance_changed_by_fkey
    foreign key (changed_by) references auth.users (id) on delete set null,
  constraint catalogue_draft_provenance_path_check check (btrim(field_path) <> ''),
  constraint catalogue_draft_provenance_origin_check
    check (origin in ('deterministic', 'model', 'manual')),
  constraint catalogue_draft_provenance_source_check check (
    (source_evidence_id is null or source_version_id is not null)
    and (origin = 'manual' or source_version_id is not null)
  )
);

alter table public.catalogue_drafts enable row level security;
alter table public.catalogue_change_events enable row level security;
alter table public.catalogue_field_changes enable row level security;
alter table public.catalogue_draft_provenance enable row level security;

create policy catalogue_drafts_read
on public.catalogue_drafts
for select
to authenticated
using ((select private.can_read_catalogue_drafts()));

create policy catalogue_change_events_read
on public.catalogue_change_events
for select
to authenticated
using ((select private.can_read_catalogue_drafts()));

create policy catalogue_field_changes_read
on public.catalogue_field_changes
for select
to authenticated
using (
  exists (
    select 1
    from public.catalogue_change_events as events
    where events.id = catalogue_field_changes.event_id
      and (select private.can_read_catalogue_drafts())
  )
);

create policy catalogue_draft_provenance_read
on public.catalogue_draft_provenance
for select
to authenticated
using ((select private.can_read_catalogue_drafts()));

grant select on table
  public.catalogue_drafts,
  public.catalogue_change_events,
  public.catalogue_field_changes,
  public.catalogue_draft_provenance
to authenticated;

revoke all on sequence public.catalogue_change_events_id_seq from public, anon, authenticated;

comment on table public.catalogue_drafts is
  'One private mutable working aggregate per annual catalogue record.';
comment on table public.catalogue_change_events is
  'Append-only accepted draft and publication operations.';
comment on table public.catalogue_field_changes is
  'Stable semantic paths and exact old/new values for one change event.';
comment on table public.catalogue_draft_provenance is
  'Current path-specific provenance for mutable catalogue draft content.';

commit;
