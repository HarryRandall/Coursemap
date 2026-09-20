begin;

-- An in-app inbox, one row per person per thing worth telling them.
--
-- Own-row means own-row. The recent catalogue write hole came from a helper
-- that accepted a permission every sign-up already holds, so nothing here is
-- gated on a permission at all: the only reader of a row is the user named on
-- it, and the only writer is a routine that runs with definer rights inside
-- the database. `authenticated` gets select and nothing else, so a client
-- cannot invent a notification for somebody else even by accident.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  title text not null,
  body text,
  href text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_user_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint notifications_kind_check check (
    kind in ('import_run', 'key_date', 'plan_risk', 'published_change')
  ),
  constraint notifications_title_check check (btrim(title) <> ''),
  constraint notifications_href_check check (href is null or href like '/%'),
  constraint notifications_dedupe_key_check check (
    dedupe_key is null or btrim(dedupe_key) <> ''
  )
);

-- The bell reads one page of a person's rows, newest first.
create index notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

-- The unread count is the only number on screen before the menu opens, so it
-- gets its own partial index rather than a scan over a growing history.
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- The dedupe constraint, made real. A producer that runs again for the same
-- subject names the same key and the second insert is dropped rather than
-- stacked. Rows without a key are one-offs and are never deduplicated, so the
-- uniqueness is partial rather than a nullable column pretending to be unique.
create unique index notifications_dedupe_idx
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.notifications enable row level security;

create policy notifications_owner_select
on public.notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

-- No insert, update or delete policy and no write grant: every producer runs
-- through private.record_notification() and reading is marked through
-- public.mark_notifications_read(). A client has no reason to write this table
-- and therefore no way to.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;

comment on table public.notifications is
  'In-app inbox. A row belongs to exactly one user, who is its only reader.';
comment on column public.notifications.dedupe_key is
  'Stable identity of the subject a repeating producer reports, unique per user.';

-- Producers ------------------------------------------------------------------------------

-- The single insert path. Callers are database routines; it is revoked from
-- every client role so a dedupe key cannot be forged from the browser.
create or replace function private.record_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_href text default null,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
set search_path = ''
as $function$
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
$function$;

revoke all on function private.record_notification(uuid, text, text, text, text, text)
from public, anon, authenticated;

-- Import run completion. Four paths end a run: the worker finishing its last
-- target, cancel_catalogue_import(), release_catalogue_import_target() and the
-- stale-lease sweep. All four write the run row through
-- private.refresh_catalogue_import_run(), so hanging the producer off that
-- write is the one place that catches every path without each caller having to
-- remember. Two of the four are SQL only and have no application code to hook.
create or replace function private.notify_catalogue_import_run_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  kind_label text;
  record_word text;
  summary text;
begin
  kind_label := case new.kind
    when 'course' then 'courses'
    when 'programme' then 'programmes'
    when 'major' then 'majors'
    when 'minor' then 'minors'
    else 'specialisations'
  end;
  record_word := case when new.target_count = 1 then 'record' else 'records' end;

  summary := case new.status
    when 'completed' then
      case
        when new.failed_count > 0 then format(
          '%s of %s %s imported, %s failed.',
          new.completed_count, new.target_count, record_word, new.failed_count
        )
        else format('%s %s ready to review.', new.completed_count, record_word)
      end
    when 'failed' then format('All %s %s failed.', new.target_count, record_word)
    else format('Stopped with %s of %s %s finished.',
      new.completed_count, new.target_count, record_word)
  end;

  perform private.record_notification(
    new.requested_by,
    'import_run',
    format('Import run #%s %s', new.run_number, new.status),
    summary,
    format('/admin/%s/imports?run=%s', kind_label, new.id),
    format('import_run:%s', new.id)
  );

  return null;
end;
$function$;

revoke all on function private.notify_catalogue_import_run_finished()
from public, anon, authenticated;

-- refresh_catalogue_import_run() rewrites the run row on every target result,
-- so the trigger insists on an actual change into a terminal status. The
-- dedupe key is a second guard, not the first one.
create trigger catalogue_import_runs_notify_finished
after update of status on public.catalogue_import_runs
for each row
when (
  old.status is distinct from new.status
  and new.status in ('completed', 'failed', 'cancelled')
)
execute function private.notify_catalogue_import_run_finished();

-- Reading --------------------------------------------------------------------------------

-- Marks the caller's unread rows read. It takes no user, so there is nothing
-- to tamper with: the filter is auth.uid() and a caller passing another
-- person's notification ids marks nothing.
create or replace function public.mark_notifications_read(
  p_notification_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

comment on function public.mark_notifications_read(uuid[]) is
  'Marks the calling user''s unread notifications read. Null marks all of them.';

commit;
