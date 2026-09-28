-- Public club profiles and event snapshots, independent of academic deadlines.
create table public.societies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  source text not null,
  source_id text not null,
  name text not null,
  short_name text not null,
  category text not null check (category in ('Academic', 'Arts and performance', 'Culture and community', 'Hobbies and interests', 'Advocacy')),
  summary text not null,
  overview text not null,
  interests text[] not null default '{}',
  website_url text,
  logo_url text,
  instagram_url text,
  facebook_url text,
  discord_url text,
  source_url text not null,
  fetched_at timestamptz not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'published' check (status in ('published', 'archived')),
  constraint societies_source_unique unique (source, source_id)
);

create table public.society_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete restrict,
  source text not null,
  source_id text not null,
  title text not null,
  category text not null check (category in ('social', 'workshop', 'gaming')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  description text not null,
  artwork_url text,
  tickets_url text,
  source_url text not null,
  fetched_at timestamptz not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'published' check (status in ('published', 'archived')),
  constraint society_events_source_unique unique (source, source_id),
  constraint society_events_date_range check (ends_at > starts_at)
);
create index society_events_society_id_idx on public.society_events(society_id);
create index society_events_starts_at_idx on public.society_events(starts_at) where status = 'published';

alter table public.societies enable row level security;
alter table public.society_events enable row level security;
create policy societies_published_select on public.societies
  for select to anon, authenticated using (status = 'published');
create policy society_events_published_select on public.society_events
  for select to anon, authenticated using (
    status = 'published' and exists (
      select 1 from public.societies where societies.id = society_events.society_id and societies.status = 'published'
    )
  );
revoke all on public.societies, public.society_events from public, anon, authenticated, service_role;
grant select on public.societies, public.society_events to anon, authenticated;
grant all on public.societies, public.society_events to service_role;
comment on table public.society_events is 'Public society events with source provenance. Every event belongs to a local club profile.';
