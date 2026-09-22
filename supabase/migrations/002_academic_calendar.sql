-- Coursemap baseline, part 2 of 8: academic years and periods
--
-- The years a catalogue record can belong to and the teaching periods inside
-- them. Calendar events hang off academic_years rather than carrying their
-- own provenance tables, so a key date and a course offering agree on what a
-- year means.

create table if not exists public.academic_periods (
    id bigint not null,
    calendar_year smallint not null,
    code text not null,
    name text not null,
    short_name text not null,
    starts_on date not null,
    ends_on date not null,
    sort_order integer not null,
    status text default 'draft'::text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint academic_periods_calendar_year_check check (((calendar_year >= 2000) and (calendar_year <= 2200))),
    constraint academic_periods_code_not_blank_check check ((btrim(code) <> ''::text)),
    constraint academic_periods_dates_check check ((ends_on >= starts_on)),
    constraint academic_periods_name_not_blank_check check ((btrim(name) <> ''::text)),
    constraint academic_periods_short_name_not_blank_check check ((btrim(short_name) <> ''::text)),
    constraint academic_periods_sort_order_check check ((sort_order >= 0)),
    constraint academic_periods_status_check check ((status = any (array['draft'::text, 'published'::text, 'archived'::text])))
);

create table if not exists public.academic_years (
    id bigint not null,
    year smallint not null,
    is_import_enabled boolean default false not null,
    source_availability text default 'unknown'::text not null,
    availability_checked_at timestamp with time zone,
    directory_refreshed_at timestamp with time zone,
    availability_note text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    calendar_published_at timestamp with time zone,
    constraint academic_years_availability_note_check check (((availability_note is null) or (btrim(availability_note) <> ''::text))),
    constraint academic_years_source_availability_check check ((source_availability = any (array['unknown'::text, 'available'::text, 'unavailable'::text]))),
    constraint academic_years_year_range_check check (((year >= 2000) and (year <= 2200)))
);

create table if not exists public.university_calendar_events (
    id bigint not null,
    calendar_year smallint not null,
    event_date date not null,
    title text not null,
    status text default 'draft'::text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    academic_year_id bigint not null,
    source_page_id bigint,
    constraint university_calendar_events_calendar_year_check check (((calendar_year >= 2000) and (calendar_year <= 2200))),
    constraint university_calendar_events_date_within_year_check check ((EXTRACT(year from event_date) = (calendar_year)::numeric)),
    constraint university_calendar_events_status_check check ((status = any (array['draft'::text, 'published'::text, 'archived'::text]))),
    constraint university_calendar_events_title_not_blank_check check ((btrim(title) <> ''::text))
);

create table if not exists public.university_calendar_imports (
    id uuid default gen_random_uuid() not null,
    academic_year_id bigint not null,
    source_page_id bigint not null,
    parser_version text not null,
    status text not null,
    checked_count integer default 0 not null,
    added_count integer default 0 not null,
    changed_count integer default 0 not null,
    archived_count integer default 0 not null,
    unchanged_count integer default 0 not null,
    failed_count integer default 0 not null,
    diagnostics jsonb default '[]'::jsonb not null,
    imported_at timestamp with time zone default statement_timestamp() not null,
    constraint university_calendar_imports_counts_check check (((checked_count >= 0) and (added_count >= 0) and (changed_count >= 0) and (archived_count >= 0) and (unchanged_count >= 0) and (failed_count >= 0))),
    constraint university_calendar_imports_diagnostics_array_check check ((jsonb_typeof(diagnostics) = 'array'::text)),
    constraint university_calendar_imports_parser_version_not_blank_check check ((btrim(parser_version) <> ''::text)),
    constraint university_calendar_imports_status_check check ((status = any (array['succeeded'::text, 'failed'::text])))
);

alter table public.academic_periods ALTER column id add generated always as identity (
    sequence NAME public.academic_periods_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.academic_years ALTER column id add generated always as identity (
    sequence NAME public.academic_years_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table public.university_calendar_events ALTER column id add generated always as identity (
    sequence NAME public.university_calendar_events_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table only public.academic_periods
    add constraint academic_periods_pkey primary key (id);

alter table only public.academic_periods
    add constraint academic_periods_year_code_unique unique (calendar_year, code);

alter table only public.academic_years
    add constraint academic_years_id_year_unique unique (id, year);

alter table only public.academic_years
    add constraint academic_years_pkey primary key (id);

alter table only public.academic_years
    add constraint academic_years_year_unique unique (year);

alter table only public.university_calendar_events
    add constraint university_calendar_events_natural_key_unique unique (calendar_year, event_date, title);

alter table only public.university_calendar_events
    add constraint university_calendar_events_pkey primary key (id);

alter table only public.university_calendar_imports
    add constraint university_calendar_imports_pkey primary key (id);

alter table only public.university_calendar_events
    add constraint university_calendar_events_academic_year_fkey foreign key (academic_year_id, calendar_year) references public.academic_years(id, year);

alter table only public.university_calendar_imports
    add constraint university_calendar_imports_academic_year_id_fkey foreign key (academic_year_id) references public.academic_years(id);

create index academic_periods_status_sort_idx on public.academic_periods using btree (status, sort_order);

create index academic_years_import_enabled_idx on public.academic_years using btree (year) where is_import_enabled;

create index university_calendar_events_academic_year_id_idx on public.university_calendar_events using btree (academic_year_id);

create index university_calendar_events_source_page_id_idx on public.university_calendar_events using btree (source_page_id);

create index university_calendar_events_status_year_idx on public.university_calendar_events using btree (status, calendar_year);

create index university_calendar_events_year_date_idx on public.university_calendar_events using btree (calendar_year, event_date);

create index university_calendar_imports_academic_year_imported_idx on public.university_calendar_imports using btree (academic_year_id, imported_at desc);

create or replace trigger academic_periods_set_updated_at before update on public.academic_periods for each row execute function private.set_updated_at();

create or replace trigger academic_years_set_updated_at before update on public.academic_years for each row execute function private.set_updated_at();

create or replace trigger university_calendar_events_set_updated_at before update on public.university_calendar_events for each row execute function private.set_updated_at();

alter table public.academic_periods enable row level security;

alter table public.academic_years enable row level security;

alter table public.university_calendar_events enable row level security;

alter table public.university_calendar_imports enable row level security;

create policy academic_periods_admin_all on public.academic_periods to authenticated using (( select private.has_permission('catalogue.write'::text) as has_permission)) with check (( select private.has_permission('catalogue.write'::text) as has_permission));

create policy academic_periods_read_drafts on public.academic_periods for select to authenticated using (( select private.has_permission('catalogue.read_drafts'::text) as has_permission));

create policy academic_periods_read_published on public.academic_periods for select to authenticated, anon using ((status = 'published'::text));

create policy academic_years_import_admin_all on public.academic_years to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission)) with check (( select private.has_permission('imports.manage'::text) as has_permission));

create policy academic_years_read on public.academic_years for select to authenticated, anon using (true);

create policy university_calendar_events_read_published on public.university_calendar_events for select to authenticated, anon using ((status = 'published'::text));

create policy university_calendar_imports_import_admin_read on public.university_calendar_imports for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

comment on table public.academic_years is 'Course import year registry. Rows do not imply that detailed courses have been imported.';

comment on table public.university_calendar_imports is 'Audit of command-line university calendar imports, one row per manifest processed.';

comment on column public.academic_years.calendar_published_at is 'When the university calendar for this year last completed a clean import.';

-- The years and teaching periods Coursemap knows about. A catalogue record
-- cannot exist without the year it belongs to, so these come with the schema.
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (1, 2020, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (2, 2021, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (3, 2022, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (4, 2023, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (5, 2024, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (6, 2025, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (7, 2026, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (8, 2027, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (9, 2028, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (10, 2029, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_years (id, year, is_import_enabled, source_availability, availability_checked_at, directory_refreshed_at, availability_note, created_at, updated_at, calendar_published_at) OVERRIDING SYSTEM VALUE VALUES (11, 2030, true, 'unknown', NULL, NULL, NULL, '2026-09-22 10:20:47.833703+00', '2026-09-22 10:20:47.95085+00', NULL);
INSERT INTO public.academic_periods (id, calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES (1, 2027, 'SUMMER', 'Summer Session', 'Summer', '2027-01-01', '2027-03-31', 5, 'draft', '2026-09-22 10:20:47.624949+00', '2026-09-22 10:20:47.624949+00');
INSERT INTO public.academic_periods (id, calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES (2, 2027, 'S1', 'First Semester', 'S1', '2027-02-22', '2027-05-28', 10, 'draft', '2026-09-22 10:20:47.624949+00', '2026-09-22 10:20:47.624949+00');
INSERT INTO public.academic_periods (id, calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES (3, 2027, 'AUTUMN', 'Autumn Session', 'Autumn', '2027-04-01', '2027-06-30', 15, 'draft', '2026-09-22 10:20:47.624949+00', '2026-09-22 10:20:47.624949+00');
INSERT INTO public.academic_periods (id, calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES (4, 2027, 'WINTER', 'Winter Session', 'Winter', '2027-07-01', '2027-09-30', 20, 'draft', '2026-09-22 10:20:47.624949+00', '2026-09-22 10:20:47.624949+00');
INSERT INTO public.academic_periods (id, calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES (5, 2027, 'S2', 'Second Semester', 'S2', '2027-07-26', '2027-10-29', 30, 'draft', '2026-09-22 10:20:47.624949+00', '2026-09-22 10:20:47.624949+00');
INSERT INTO public.academic_periods (id, calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES (6, 2027, 'SPRING', 'Spring Session', 'Spring', '2027-10-01', '2027-12-31', 35, 'draft', '2026-09-22 10:20:47.624949+00', '2026-09-22 10:20:47.624949+00');

-- The rows above carry their own ids, so the identity sequences are moved
-- past them; otherwise the next insert would collide with seeded data.
select setval('public.academic_years_id_seq', (select max(id) from public.academic_years));
select setval('public.academic_periods_id_seq', (select max(id) from public.academic_periods));

-- Every object is taken back to nothing before it is granted anything, so the
-- grants below are the whole of what each role holds rather than an addition
-- to whatever Supabase's defaults already handed out.

revoke all on table public.academic_periods from public, anon, authenticated, service_role;

revoke all on sequence public.academic_periods_id_seq from public, anon, authenticated, service_role;

revoke all on table public.academic_years from public, anon, authenticated, service_role;

revoke all on sequence public.academic_years_id_seq from public, anon, authenticated, service_role;

revoke all on table public.university_calendar_events from public, anon, authenticated, service_role;

revoke all on sequence public.university_calendar_events_id_seq from public, anon, authenticated, service_role;

revoke all on table public.university_calendar_imports from public, anon, authenticated, service_role;

grant all on table public.academic_periods to service_role;

grant select on table public.academic_periods to anon;

grant select,insert,delete,update on table public.academic_periods to authenticated;

grant all on sequence public.academic_periods_id_seq to service_role;

grant select,usage on sequence public.academic_periods_id_seq to authenticated;

grant all on table public.academic_years to service_role;

grant select on table public.academic_years to anon;

grant select,insert,update on table public.academic_years to authenticated;

grant all on sequence public.academic_years_id_seq to service_role;

grant select,usage on sequence public.academic_years_id_seq to authenticated;

grant all on table public.university_calendar_events to service_role;

grant select on table public.university_calendar_events to anon;

grant select on table public.university_calendar_events to authenticated;

grant all on sequence public.university_calendar_events_id_seq to service_role;

grant all on table public.university_calendar_imports to service_role;

grant select on table public.university_calendar_imports to authenticated;
