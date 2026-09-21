begin;

alter table public.catalogue_directory_entries
  rename to catalogue_listings;
alter table public.catalogue_directory_statuses
  rename to catalogue_discovery_statuses;

alter table public.catalogue_listings
  rename constraint catalogue_directory_entries_unique to catalogue_listings_unique;
alter table public.catalogue_listings
  rename constraint catalogue_directory_entries_academic_year_fkey to catalogue_listings_academic_year_fkey;
alter table public.catalogue_listings
  rename constraint catalogue_directory_entries_item_fkey to catalogue_listings_code_fkey;
alter table public.catalogue_listings
  rename constraint catalogue_directory_entries_source_page_fkey to catalogue_listings_source_page_fkey;
alter table public.catalogue_listings
  rename constraint catalogue_directory_entries_kind_check to catalogue_listings_kind_check;
alter table public.catalogue_listings
  rename constraint catalogue_directory_entries_summary_check to catalogue_listings_summary_check;
alter index public.catalogue_directory_entries_lookup_idx
  rename to catalogue_listings_lookup_idx;
alter sequence public.catalogue_directory_entries_id_seq
  rename to catalogue_listings_id_seq;
alter policy catalogue_directory_entries_import_admin_read
  on public.catalogue_listings rename to catalogue_listings_admin_read;

alter table public.catalogue_discovery_statuses
  rename constraint catalogue_directory_statuses_pkey to catalogue_discovery_statuses_pkey;
alter table public.catalogue_discovery_statuses
  rename constraint catalogue_directory_statuses_academic_year_fkey to catalogue_discovery_statuses_academic_year_fkey;
alter table public.catalogue_discovery_statuses
  rename constraint catalogue_directory_statuses_kind_check to catalogue_discovery_statuses_kind_check;
alter table public.catalogue_discovery_statuses
  rename constraint catalogue_directory_statuses_status_check to catalogue_discovery_statuses_status_check;
alter policy catalogue_directory_statuses_import_admin_read
  on public.catalogue_discovery_statuses rename to catalogue_discovery_statuses_admin_read;

alter table public.catalogue_listings
  add column record_id bigint;

insert into public.catalogue_codes (kind, code)
select distinct kind, code
from public.catalogue_listings
on conflict (kind, code) do nothing;

update public.catalogue_listings as listings
set code_id = codes.id
from public.catalogue_codes as codes
where codes.kind = listings.kind
  and codes.code = listings.code;

insert into public.catalogue_records (code_id, kind, academic_year_id)
select distinct code_id, kind, academic_year_id
from public.catalogue_listings
where code_id is not null
on conflict (code_id, academic_year_id) do nothing;

update public.catalogue_listings as listings
set record_id = records.id
from public.catalogue_records as records
where records.code_id = listings.code_id
  and records.academic_year_id = listings.academic_year_id;

alter table public.catalogue_listings
  alter column code_id set not null,
  alter column record_id set not null,
  add constraint catalogue_listings_record_fkey
    foreign key (record_id, academic_year_id)
    references public.catalogue_records (id, academic_year_id);

create index catalogue_listings_record_idx
  on public.catalogue_listings (record_id);

create table public.catalogue_discovery_checks (
  id bigint generated always as identity primary key,
  academic_year_id bigint not null references public.academic_years (id),
  kind text not null,
  source text not null default 'anu',
  status text not null,
  is_complete boolean not null default false,
  discovered_count integer not null default 0,
  source_page_id bigint,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint catalogue_discovery_checks_kind_check check (
    kind in ('course', 'programme', 'major', 'minor', 'specialisation')
  ),
  constraint catalogue_discovery_checks_status_check check (
    status in ('running', 'completed', 'failed')
  ),
  constraint catalogue_discovery_checks_count_check check (discovered_count >= 0),
  constraint catalogue_discovery_checks_source_page_fkey
    foreign key (source_page_id, academic_year_id)
    references public.catalogue_source_pages (id, academic_year_id)
);

create index catalogue_discovery_checks_recent_idx
  on public.catalogue_discovery_checks (academic_year_id, kind, started_at desc);

create table public.catalogue_discovery_check_source_pages (
  discovery_check_id bigint not null
    references public.catalogue_discovery_checks (id) on delete cascade,
  source_page_id bigint not null references public.catalogue_source_pages (id),
  primary key (discovery_check_id, source_page_id)
);

create index catalogue_discovery_check_source_pages_page_idx
  on public.catalogue_discovery_check_source_pages (source_page_id);

alter table public.catalogue_discovery_checks enable row level security;
alter table public.catalogue_discovery_check_source_pages enable row level security;
create policy catalogue_discovery_checks_admin_read
on public.catalogue_discovery_checks for select to authenticated
using ((select private.has_permission('imports.manage')));
create policy catalogue_discovery_check_source_pages_admin_read
on public.catalogue_discovery_check_source_pages for select to authenticated
using ((select private.has_permission('imports.manage')));

grant select on table public.catalogue_discovery_checks to authenticated;
grant select on table public.catalogue_discovery_check_source_pages to authenticated;
grant select, insert, update, delete on table public.catalogue_discovery_checks to service_role;
grant select, insert, update, delete on table public.catalogue_discovery_check_source_pages to service_role;
grant usage, select on sequence public.catalogue_discovery_checks_id_seq to service_role;

comment on table public.catalogue_listings is
  'ANU listing metadata for one catalogue record and academic year.';
comment on table public.catalogue_discovery_checks is
  'One attempt to discover ANU catalogue listings for a kind and academic year.';
comment on table public.catalogue_discovery_check_source_pages is
  'Immutable ANU listing pages consulted by one catalogue discovery check.';

-- Branch 04 will replace the import pipeline. Its existing stored procedures
-- still resolve this historical relation name at execution time, so keep a
-- read-only compatibility view outside the product-facing discovery model.
create view public.catalogue_directory_entries
with (security_invoker = true)
as select * from public.catalogue_listings;
grant select on table public.catalogue_directory_entries to authenticated, service_role;

commit;
