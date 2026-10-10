-- Routing requests share one provider slot across all application instances.
create table public.room_route_cache (
  route_key text primary key,
  coordinates jsonb not null,
  distance_metres double precision not null,
  duration_seconds double precision not null,
  cached_at timestamptz not null default now()
);

alter table public.room_route_cache enable row level security;
revoke all on public.room_route_cache from public, anon, authenticated, service_role;
grant select, insert, update on public.room_route_cache to service_role;

create table private.room_route_throttle (
  singleton boolean primary key default true check (singleton),
  last_request_at timestamptz not null default '-infinity'
);

insert into private.room_route_throttle (singleton) values (true);
alter table private.room_route_throttle enable row level security;
revoke all on private.room_route_throttle from public, anon, authenticated, service_role;

create function public.claim_room_route_request()
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    update private.room_route_throttle
    set last_request_at = pg_catalog.clock_timestamp()
    where singleton
      and last_request_at < pg_catalog.clock_timestamp() - interval '1 second'
    returning singleton
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.claim_room_route_request() from public, anon, authenticated;
grant execute on function public.claim_room_route_request() to service_role;
