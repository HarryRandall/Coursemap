begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('98100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'fee-owner@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('98100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'fee-other@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claim.sub', '98100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
update public.profiles set fee_status = 'international'
where id = '98100000-0000-4000-8000-000000000001';
select extensions.is((select fee_status from public.profiles where id = '98100000-0000-4000-8000-000000000001'), 'international', 'owners can save their fee status');
select extensions.throws_ok(
  $$update public.profiles set fee_status = 'scholarship' where id = '98100000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'fee status only takes the known values'
);
update public.profiles set fee_status = 'domestic_fee' where id = '98100000-0000-4000-8000-000000000002';
reset role;
select extensions.is((select fee_status from public.profiles where id = '98100000-0000-4000-8000-000000000002'), null::text, 'owners cannot change another fee status');
set local role authenticated;
update public.profiles set fee_status = null where id = '98100000-0000-4000-8000-000000000001';
select extensions.is((select fee_status from public.profiles where id = '98100000-0000-4000-8000-000000000001'), null::text, 'fee status can be cleared');
select * from extensions.finish();
rollback;
