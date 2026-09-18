begin;

-- The university calendar was the last consumer of the generic catalogue
-- provenance family (catalogue_years, catalogue_sources,
-- catalogue_source_documents, catalogue_import_runs, catalogue_import_items).
-- This migration keys calendar events to academic_years, introduces the shared
-- catalogue_sources and catalogue_source_pages provenance tables that the
-- unified import pipeline will adopt, and removes the legacy family. It is a
-- development cutover: calendar events are cleared and re-imported with
-- `pnpm calendar:import`.

truncate table public.university_calendar_events;

alter table public.university_calendar_events
  drop column source_document_id;

drop table public.catalogue_import_items;
drop table public.catalogue_import_runs;
drop table public.catalogue_source_documents;
drop table public.catalogue_sources;
drop table public.catalogue_years;

-- Shared provenance ------------------------------------------------------------

create table public.catalogue_sources (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null,
  base_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogue_sources_kind_base_url_unique unique (kind, base_url),
  constraint catalogue_sources_name_not_blank_check check (btrim(name) <> ''),
  constraint catalogue_sources_kind_not_blank_check check (btrim(kind) <> ''),
  constraint catalogue_sources_base_url_check check (
    base_url ~ '^https://[^[:space:]]+$'
  )
);

-- One row per fetched document. Page bodies live in storage; the row keeps the
-- hash and retrieval provenance. Rows are immutable: a changed document is a
-- new row with a new content hash.
create table public.catalogue_source_pages (
  id bigint generated always as identity primary key,
  source_id bigint not null,
  academic_year_id bigint not null,
  kind text not null,
  external_key text not null,
  canonical_url text not null,
  media_type text not null default 'text/html',
  content_sha256 text not null,
  http_status smallint,
  http_etag text,
  source_last_modified timestamptz,
  fetched_at timestamptz not null default now(),
  byte_size bigint,
  storage_bucket text,
  storage_path text,
  created_at timestamptz not null default now(),
  constraint catalogue_source_pages_source_id_fkey
    foreign key (source_id) references public.catalogue_sources (id),
  constraint catalogue_source_pages_academic_year_id_fkey
    foreign key (academic_year_id) references public.academic_years (id),
  constraint catalogue_source_pages_content_unique unique (
    source_id,
    academic_year_id,
    kind,
    external_key,
    content_sha256
  ),
  constraint catalogue_source_pages_kind_check check (
    kind in (
      'calendar',
      'directory',
      'course',
      'programme',
      'major',
      'minor',
      'specialisation'
    )
  ),
  constraint catalogue_source_pages_external_key_not_blank_check check (
    btrim(external_key) <> ''
  ),
  constraint catalogue_source_pages_canonical_url_check check (
    canonical_url ~ '^https://[^[:space:]]+$'
  ),
  constraint catalogue_source_pages_media_type_not_blank_check check (
    btrim(media_type) <> ''
  ),
  constraint catalogue_source_pages_content_sha256_check check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint catalogue_source_pages_byte_size_check check (
    byte_size is null or byte_size >= 0
  ),
  constraint catalogue_source_pages_storage_check check (
    (storage_bucket is null) = (storage_path is null)
  )
);

create index catalogue_source_pages_academic_year_kind_idx
  on public.catalogue_source_pages (academic_year_id, kind, external_key);

create index catalogue_source_pages_source_id_idx
  on public.catalogue_source_pages (source_id);

create or replace function private.reject_immutable_catalogue_record_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception '% records are immutable; create a new record instead', tg_table_name
    using errcode = '55000';
end;
$function$;

revoke all on function private.reject_immutable_catalogue_record_mutation()
from public, anon, authenticated;

create trigger catalogue_sources_set_updated_at
before update on public.catalogue_sources
for each row execute function private.set_updated_at();

create trigger catalogue_source_pages_reject_mutation
before update or delete on public.catalogue_source_pages
for each row execute function private.reject_immutable_catalogue_record_mutation();

alter table public.catalogue_sources enable row level security;
alter table public.catalogue_source_pages enable row level security;

create policy catalogue_sources_import_admin_all
on public.catalogue_sources
for all
to authenticated
using ((select private.has_permission('imports.manage')))
with check ((select private.has_permission('imports.manage')));

create policy catalogue_source_pages_import_admin_read
on public.catalogue_source_pages
for select
to authenticated
using ((select private.has_permission('imports.manage')));

create policy catalogue_source_pages_import_admin_insert
on public.catalogue_source_pages
for insert
to authenticated
with check ((select private.has_permission('imports.manage')));

grant select, insert, update on table public.catalogue_sources to authenticated;
grant select, insert on table public.catalogue_source_pages to authenticated;
grant select, insert, update on table public.catalogue_sources to service_role;
grant select, insert on table public.catalogue_source_pages to service_role;

comment on table public.catalogue_sources is
  'External systems that catalogue content is fetched from.';

comment on table public.catalogue_source_pages is
  'Immutable retrieval provenance for fetched catalogue documents. Bodies are stored in the private artefact bucket.';

-- Calendar on academic years ---------------------------------------------------

alter table public.academic_years
  add column calendar_published_at timestamptz;

comment on column public.academic_years.calendar_published_at is
  'When the university calendar for this year last completed a clean import.';

-- calendar_year stays as the denormalised natural-key column so the public
-- reader and the date-within-year check need no join. The composite foreign
-- key, on the existing academic_years (id, year) unique constraint, keeps it
-- consistent with the referenced academic year.
alter table public.university_calendar_events
  add column academic_year_id bigint not null,
  add column source_page_id bigint,
  add constraint university_calendar_events_academic_year_fkey
    foreign key (academic_year_id, calendar_year)
    references public.academic_years (id, year),
  add constraint university_calendar_events_source_page_id_fkey
    foreign key (source_page_id) references public.catalogue_source_pages (id);

create index university_calendar_events_academic_year_id_idx
  on public.university_calendar_events (academic_year_id);

create index university_calendar_events_source_page_id_idx
  on public.university_calendar_events (source_page_id);

-- One row per completed command-line calendar import. The importer runs in a
-- single transaction, so only terminal statuses are recorded.
create table public.university_calendar_imports (
  id uuid primary key default gen_random_uuid(),
  academic_year_id bigint not null,
  source_page_id bigint not null,
  parser_version text not null,
  status text not null,
  checked_count integer not null default 0,
  added_count integer not null default 0,
  changed_count integer not null default 0,
  archived_count integer not null default 0,
  unchanged_count integer not null default 0,
  failed_count integer not null default 0,
  diagnostics jsonb not null default '[]'::jsonb,
  -- Statement time rather than transaction time so several imports recorded in
  -- one transaction, as the integration test does, keep their order.
  imported_at timestamptz not null default statement_timestamp(),
  constraint university_calendar_imports_academic_year_id_fkey
    foreign key (academic_year_id) references public.academic_years (id),
  constraint university_calendar_imports_source_page_id_fkey
    foreign key (source_page_id) references public.catalogue_source_pages (id),
  constraint university_calendar_imports_parser_version_not_blank_check check (
    btrim(parser_version) <> ''
  ),
  constraint university_calendar_imports_status_check check (
    status in ('succeeded', 'failed')
  ),
  constraint university_calendar_imports_counts_check check (
    checked_count >= 0
    and added_count >= 0
    and changed_count >= 0
    and archived_count >= 0
    and unchanged_count >= 0
    and failed_count >= 0
  ),
  constraint university_calendar_imports_diagnostics_array_check check (
    jsonb_typeof(diagnostics) = 'array'
  )
);

create index university_calendar_imports_academic_year_imported_idx
  on public.university_calendar_imports (academic_year_id, imported_at desc);

create trigger university_calendar_imports_reject_mutation
before update or delete on public.university_calendar_imports
for each row execute function private.reject_immutable_catalogue_record_mutation();

alter table public.university_calendar_imports enable row level security;

create policy university_calendar_imports_import_admin_read
on public.university_calendar_imports
for select
to authenticated
using ((select private.has_permission('imports.manage')));

-- Writes happen only through the verified import CLI, which connects as the
-- table owner, so no write grants are exposed to application roles.
grant select on table public.university_calendar_imports to authenticated;

comment on table public.university_calendar_imports is
  'Audit of command-line university calendar imports, one row per manifest processed.';

commit;
