-- Coursemap baseline, part 7 of 8: notifications
--
-- One inbox table with own-row access and a deduplicating producer. A
-- notification is written by a trigger on the thing that happened rather
-- than by application code after the fact, so an event that is rolled back
-- never leaves a notice behind.

create table if not exists public.notifications (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    kind text not null,
    title text not null,
    body text,
    href text,
    dedupe_key text,
    read_at timestamp with time zone,
    created_at timestamp with time zone default now() not null,
    constraint notifications_dedupe_key_check check (((dedupe_key is null) or (btrim(dedupe_key) <> ''::text))),
    constraint notifications_href_check check (((href is null) or (href ~~ '/%'::text))),
    constraint notifications_kind_check check ((kind = any (array['key_date'::text, 'plan_risk'::text, 'published_change'::text, 'catalogue_sync'::text]))),
    constraint notifications_title_check check ((btrim(title) <> ''::text))
);

alter table only public.notifications
    add constraint notifications_pkey primary key (id);

alter table only public.notifications
    add constraint notifications_user_fkey foreign key (user_id) references auth.users(id) on delete cascade;

create unique index notifications_dedupe_idx on public.notifications using btree (user_id, dedupe_key) where (dedupe_key is not null);

create index notifications_user_recent_idx on public.notifications using btree (user_id, created_at desc);

create index notifications_user_unread_idx on public.notifications using btree (user_id, created_at desc) where (read_at is null);

create or replace function private.record_notification(p_user_id uuid, p_kind text, p_title text, p_body text default null::text, p_href text default null::text, p_dedupe_key text default null::text) returns uuid
    language plpgsql
    set search_path to ''
    as $$
declare
  recorded uuid;
begin
  -- A run whose requester was deleted has nobody to tell.
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (user_id, kind, title, body, href, dedupe_key)
  values (p_user_id, p_kind, p_title, p_body, p_href, p_dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into recorded;

  return recorded;
end;
$$;

create or replace function public.mark_notifications_read(p_notification_ids uuid[] default null::uuid[]) returns integer
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  reader uuid := (select auth.uid());
  marked integer;
begin
  if reader is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  with changed as (
    update public.notifications
    set read_at = now()
    where user_id = reader
      and read_at is null
      and (p_notification_ids is null or id = any (p_notification_ids))
    returning id
  )
  select count(*) into marked from changed;

  return marked;
end;
$$;

comment on function public.mark_notifications_read(p_notification_ids uuid[]) is 'Marks the calling user''s unread notifications read. Null marks all of them.';

alter table public.notifications enable row level security;

create policy notifications_owner_select on public.notifications for select to authenticated using ((( select auth.uid() as uid) = user_id));

comment on table public.notifications is 'In-app inbox. A row belongs to exactly one user, who is its only reader.';

comment on column public.notifications.dedupe_key is 'Stable identity of the subject a repeating producer reports, unique per user.';

-- Every object is taken back to nothing before it is granted anything, so the
-- grants below are the whole of what each role holds rather than an addition
-- to whatever Supabase's defaults already handed out.

revoke all on function private.record_notification(p_user_id uuid, p_kind text, p_title text, p_body text, p_href text, p_dedupe_key text) from public, anon, authenticated, service_role;

revoke all on function public.mark_notifications_read(p_notification_ids uuid[]) from public, anon, authenticated, service_role;

revoke all on table public.notifications from public, anon, authenticated, service_role;

revoke all on function private.record_notification(p_user_id uuid, p_kind text, p_title text, p_body text, p_href text, p_dedupe_key text) from public;

revoke all on function public.mark_notifications_read(p_notification_ids uuid[]) from public;

grant all on function public.mark_notifications_read(p_notification_ids uuid[]) to authenticated;

grant all on function public.mark_notifications_read(p_notification_ids uuid[]) to service_role;

grant all on table public.notifications to service_role;

grant select on table public.notifications to authenticated;
