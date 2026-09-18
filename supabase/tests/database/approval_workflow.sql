begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'approval-owner@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Approval Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'approval-reviewer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Approval Reviewer"}'::jsonb,
    now(),
    now()
  );

select pg_temp.catalogue_item_year('course', 'TEST1000', 2029::smallint);

insert into public.plans (
  id,
  owner_id,
  academic_year_id,
  name,
  commencement_year,
  study_load
)
values (
  '31000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  (select id from public.academic_years where year = 2029),
  'Approval test plan',
  2029,
  'full_time'
);

insert into public.plan_items (
  id,
  plan_id,
  owner_id,
  course_id,
  academic_year_id
)
values (
  '32000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  (select id from public.catalogue_items where code = 'TEST1000'),
  (select id from public.academic_years where year = 2029)
);

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","email":"approval-owner@example.test"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$
    insert into public.approval_requests (
      owner_id,
      plan_item_id,
      request_kind,
      reason
    )
    values (
      '30000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      'overload',
      'Approval workflow fixture'
    )
  $$,
  'an owner can submit a pending approval request'
);

select extensions.results_eq(
  $$
    select events.event_kind, events.actor_id
    from public.approval_events as events
    join public.approval_requests as requests
      on requests.id = events.approval_request_id
    where requests.reason = 'Approval workflow fixture'
  $$,
  $$
    values (
      'created'::text,
      '30000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'submission appends one created event with the owner as actor'
);

select extensions.throws_ok(
  $$
    insert into public.approval_requests (
      owner_id,
      request_kind,
      reason,
      status
    )
    values (
      '30000000-0000-4000-8000-000000000001',
      'other',
      'Spoofed terminal request',
      'approved'
    )
  $$,
  '42501',
  null,
  'an owner cannot supply protected resolution fields during submission'
);

select extensions.throws_ok(
  $$
    insert into public.approval_events (
      approval_request_id,
      owner_id,
      event_kind,
      actor_id
    )
    select
      requests.id,
      requests.owner_id,
      'approved',
      '30000000-0000-4000-8000-000000000001'
    from public.approval_requests as requests
    where requests.reason = 'Approval workflow fixture'
  $$,
  '42501',
  null,
  'an authenticated owner cannot write approval audit events directly'
);

update public.approval_requests
set status = 'approved', decision_note = 'Self-approved'
where reason = 'Approval workflow fixture';

select extensions.results_eq(
  $$
    select status
    from public.approval_requests
    where reason = 'Approval workflow fixture'
  $$,
  $$values ('pending'::text)$$,
  'a non-reviewer update affects no approval request rows'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","email":"approval-reviewer@example.test"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.results_eq(
  $$
    select
      (select count(*) from public.approval_requests)::bigint,
      (select count(*) from public.approval_events)::bigint
  $$,
  $$values (0::bigint, 0::bigint)$$,
  'another student cannot see approval requests or their events'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

insert into private.user_roles (user_id, role_id, granted_by)
select
  '30000000-0000-4000-8000-000000000002',
  roles.id,
  '30000000-0000-4000-8000-000000000002'
from private.app_roles as roles
where roles.key = 'admin'
on conflict (user_id) do update
set
  role_id = excluded.role_id,
  granted_by = excluded.granted_by,
  granted_at = now();

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","email":"approval-reviewer@example.test"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$
    update public.approval_requests
    set status = 'approved', decision_note = 'Approved by test reviewer'
    where reason = 'Approval workflow fixture'
  $$,
  'an authorised reviewer can resolve a pending request'
);

select extensions.results_eq(
  $$
    select
      requests.status,
      requests.resolved_by,
      requests.resolved_at is not null,
      count(events.id)::bigint
    from public.approval_requests as requests
    join public.approval_events as events
      on events.approval_request_id = requests.id
     and events.event_kind = 'approved'
     and events.actor_id = requests.resolved_by
     and events.note = requests.decision_note
    where requests.reason = 'Approval workflow fixture'
    group by requests.id
  $$,
  $$
    values (
      'approved'::text,
      '30000000-0000-4000-8000-000000000002'::uuid,
      true,
      1::bigint
    )
  $$,
  'resolution stamps its reviewer and appends one matching event'
);

select extensions.throws_ok(
  $$
    update public.approval_requests
    set status = 'rejected', decision_note = 'Changed after resolution'
    where reason = 'Approval workflow fixture'
  $$,
  '23514',
  null,
  'a terminal approval request cannot be changed again'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","email":"approval-owner@example.test"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$
    select public.remove_current_user_plan_item(
      '32000000-0000-4000-8000-000000000001'
    )
  $$,
  'the owner RPC can remove a plan item linked to an approval audit trail'
);

select extensions.results_eq(
  $$
    select requests.plan_item_id, count(events.id)::bigint
    from public.approval_requests as requests
    join public.approval_events as events
      on events.approval_request_id = requests.id
    where requests.reason = 'Approval workflow fixture'
    group by requests.id
  $$,
  $$values (null::uuid, 2::bigint)$$,
  'removing a plan item preserves its approval request and both audit events'
);

reset role;

select * from extensions.finish();

rollback;
