begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('98000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'optional-owner@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('98000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'optional-other@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
update public.profiles set preferred_name = 'Ada', pronouns = 'she/her'
where id = '98000000-0000-4000-8000-000000000001';
select extensions.is((select preferred_name from public.profiles where id = '98000000-0000-4000-8000-000000000001'), 'Ada', 'owners can save a preferred name');
select extensions.is((select pronouns from public.profiles where id = '98000000-0000-4000-8000-000000000001'), 'she/her', 'owners can save pronouns');
update public.profiles set preferred_name = 'Changed' where id = '98000000-0000-4000-8000-000000000002';
reset role;
select extensions.is((select preferred_name from public.profiles where id = '98000000-0000-4000-8000-000000000002'), null::text, 'owners cannot change another profile');
set local role authenticated;
update public.profiles set preferred_name = null, pronouns = null where id = '98000000-0000-4000-8000-000000000001';
select extensions.ok((select preferred_name is null and pronouns is null from public.profiles where id = '98000000-0000-4000-8000-000000000001'), 'optional details can be cleared');
select * from extensions.finish();
rollback;
