begin;

-- Summary fields are the labelled key facts beside a programme heading on
-- programsandcourses ("Academic plan", "CRICOS code", "Minimum: 144 Units").
--
-- The structure extraction has always parsed them, the projection has always
-- carried them, and projectionSha256 hashes them, so they take part in change
-- detection. They had nowhere to land: 20260918150000_requirements.sql dropped
-- academic_structure_summary_fields and structure_version_details has no
-- equivalent columns, so every programme import silently discarded them. A
-- content hash that covers data the database never stores also means two
-- snapshots can differ by their hash alone, with no visible difference.
--
-- One row per value, because a field such as "Academic plan" lists several.

create table public.structure_snapshot_summary_fields (
  version_id bigint not null,
  position integer not null,
  value_position integer not null,
  field_key text not null,
  label text not null,
  field_value text not null,
  source_text text not null,
  constraint structure_snapshot_summary_fields_pkey
    primary key (version_id, position, value_position),
  constraint structure_snapshot_summary_fields_snapshot_fkey
    foreign key (version_id) references public.catalogue_versions (id)
    on delete cascade,
  constraint structure_snapshot_summary_fields_position_check check (position > 0),
  constraint structure_snapshot_summary_fields_value_position_check check (value_position > 0),
  constraint structure_snapshot_summary_fields_key_check check (
    field_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  ),
  constraint structure_snapshot_summary_fields_label_check check (btrim(label) <> ''),
  constraint structure_snapshot_summary_fields_value_check check (btrim(field_value) <> ''),
  constraint structure_snapshot_summary_fields_source_text_check check (btrim(source_text) <> '')
);

comment on table public.structure_snapshot_summary_fields is
  'Labelled key facts shown beside a structure heading, one row per listed value.';

-- The same guards every other snapshot child table carries: frozen once the
-- snapshot is sealed, readable with its snapshot, insertable by administrators.
create trigger structure_snapshot_summary_fields_guard_sealed
before insert or update or delete on public.structure_snapshot_summary_fields
for each row execute function private.guard_snapshot_child_mutation();

alter table public.structure_snapshot_summary_fields enable row level security;

create policy structure_snapshot_summary_fields_read
on public.structure_snapshot_summary_fields
for select
to anon, authenticated
using ((select private.can_read_version(version_id)));

create policy structure_snapshot_summary_fields_admin_insert
on public.structure_snapshot_summary_fields
for insert
to authenticated
with check ((select private.can_write_catalogue()));

grant select on table public.structure_snapshot_summary_fields to anon, authenticated;
grant select, insert, update on table public.structure_snapshot_summary_fields to service_role;

commit;
