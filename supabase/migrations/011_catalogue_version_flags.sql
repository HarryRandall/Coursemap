-- The review notes the model left on a source version: parts of its response
-- that did not fit the contract, wording the ANU page does not contain, and
-- requirement branches it kept as text. They are stored with the version
-- they describe, sealed with it, and read on the record's Changes tab. They
-- are not content, so they take no part in the version's content hash.

create table public.catalogue_version_flags (
  id bigint generated always as identity primary key,
  version_id bigint not null
    references public.catalogue_versions (id) on delete cascade,
  position integer not null,
  field_path text,
  severity text not null,
  code text not null,
  message text not null,
  constraint catalogue_version_flags_position_check check (position > 0),
  constraint catalogue_version_flags_severity_check check (
    severity = any (array['warning'::text, 'error'::text])
  ),
  constraint catalogue_version_flags_code_check check (btrim(code) <> ''),
  constraint catalogue_version_flags_message_check check (btrim(message) <> ''),
  constraint catalogue_version_flags_position_unique unique (version_id, position)
);

create trigger catalogue_version_flags_guard_sealed
  before insert or delete or update on public.catalogue_version_flags
  for each row execute function private.guard_snapshot_child_mutation();

alter table public.catalogue_version_flags enable row level security;

create policy catalogue_version_flags_read on public.catalogue_version_flags
  for select to authenticated
  using ((select private.can_read_catalogue_drafts() as can_read_catalogue_drafts));

revoke all on table public.catalogue_version_flags
  from public, anon, authenticated, service_role;
revoke all on sequence public.catalogue_version_flags_id_seq
  from public, anon, authenticated, service_role;

grant all on table public.catalogue_version_flags to service_role;
grant select on table public.catalogue_version_flags to authenticated;
grant all on sequence public.catalogue_version_flags_id_seq to service_role;
