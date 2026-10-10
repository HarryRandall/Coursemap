begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(13);

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.room_route_cache'::regclass)
  and (select relrowsecurity from pg_class where oid = 'private.room_route_throttle'::regclass),
  'route cache and throttle have RLS enabled'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.room_route_cache', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.room_route_cache', 'select,insert,update,delete'),
  'browser roles cannot access the route cache'
);

select extensions.ok(
  has_table_privilege('service_role', 'public.room_route_cache', 'select')
  and has_table_privilege('service_role', 'public.room_route_cache', 'insert')
  and has_table_privilege('service_role', 'public.room_route_cache', 'update')
  and not has_table_privilege('service_role', 'public.room_route_cache', 'delete'),
  'the server can read and persist routes without deleting them'
);

select extensions.ok(
  not has_table_privilege('anon', 'private.room_route_throttle', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'private.room_route_throttle', 'select,insert,update,delete')
  and not has_table_privilege('service_role', 'private.room_route_throttle', 'select,insert,update,delete'),
  'only the definer can modify the throttle directly'
);

select extensions.ok(
  not has_function_privilege('anon', 'public.claim_room_route_request()', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_room_route_request()', 'execute')
  and has_function_privilege('service_role', 'public.claim_room_route_request()', 'execute'),
  'only the server can claim a provider slot'
);

select extensions.ok(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc
    where oid = 'public.claim_room_route_request()'::regprocedure),
  'the throttle function uses an empty search path'
);

select extensions.throws_ok(
  $$insert into private.room_route_throttle (singleton) values (false)$$,
  '23514', null, 'a second throttle row is forbidden'
);

update private.room_route_throttle set last_request_at = '-infinity';
set local role service_role;
select extensions.is(public.claim_room_route_request(), true, 'the first provider slot is claimed');
select extensions.is(public.claim_room_route_request(), false, 'an immediate second request is denied');
reset role;

update private.room_route_throttle
set last_request_at = clock_timestamp() - interval '2 seconds';
set local role service_role;
select extensions.is(public.claim_room_route_request(), true, 'a slot becomes available after one second');
select extensions.is(public.claim_room_route_request(), false, 'the successful claim advances the throttle');

insert into public.room_route_cache (route_key, coordinates, distance_metres, duration_seconds)
values ('from-to', '[[149.12,-35.28],[149.13,-35.29]]', 100, 80);
select extensions.is(
  (select distance_metres from public.room_route_cache where route_key = 'from-to'),
  100::double precision, 'the server can read a persisted successful route'
);
update public.room_route_cache set duration_seconds = 90 where route_key = 'from-to';
select extensions.is(
  (select duration_seconds from public.room_route_cache where route_key = 'from-to'),
  90::double precision, 'the server can refresh a cached route'
);
reset role;

select * from extensions.finish();
rollback;
