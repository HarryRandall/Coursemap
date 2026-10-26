begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(9);
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '98000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'compass-owner@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '98000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'compass-other@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role anon;
select extensions.throws_ok($$ select * from public.assistant_usage $$, '42501', null, 'anonymous cannot read assistant_usage');
reset role;

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok($$
  insert into public.assistant_usage(owner_id, chat_id, model, input_tokens, output_tokens, cost_usd)
  values ('98000000-0000-4000-8000-000000000001', gen_random_uuid(), 'anthropic/claude-haiku-5.5', 9000, 400, 0.0031)
$$, 'owner can record their own usage');
select extensions.results_eq($$ select count(*)::int from public.assistant_usage $$, $$ values(1) $$, 'owner can read their own usage');
select extensions.throws_ok($$
  insert into public.assistant_usage(owner_id, chat_id, model)
  values ('98000000-0000-4000-8000-000000000002', gen_random_uuid(), 'anthropic/claude-haiku-5.5')
$$, '42501', null, 'owner cannot record usage for someone else');
select extensions.throws_ok($$
  insert into public.assistant_usage(owner_id, chat_id, model, cost_usd)
  values ('98000000-0000-4000-8000-000000000001', gen_random_uuid(), 'anthropic/claude-haiku-5.5', -1)
$$, '23514', null, 'usage cannot be negative');
select extensions.throws_ok($$ update public.assistant_usage set cost_usd = 0 $$, '42501', null, 'owner cannot rewrite usage');
select extensions.throws_ok($$ delete from public.assistant_usage $$, '42501', null, 'owner cannot delete usage to reset the allowance');
reset role;

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is_empty($$ select * from public.assistant_usage $$, 'another student cannot read the usage');
reset role;
select extensions.results_eq($$ select count(*)::int from public.assistant_usage $$, $$ values(1) $$, 'usage rows remain after the other attempts');

select * from extensions.finish();
rollback;
