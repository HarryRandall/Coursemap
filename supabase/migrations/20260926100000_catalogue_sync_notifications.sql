begin;

-- Notifications name the record an administrator asked about, not the pipeline
-- that carried it. A sync that found nothing is not worth an inbox row; a
-- failure and a set of ANU changes are.
alter table public.notifications
  drop constraint notifications_kind_check,
  add constraint notifications_kind_check check (
    kind in ('key_date', 'plan_risk', 'published_change', 'catalogue_sync')
  );

create or replace function private.notify_catalogue_sync_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  record_code text;
  record_kind text;
  record_year smallint;
  record_path text;
  change_count integer;
begin
  -- Only a person who asked has an inbox to tell. Scheduled work reports
  -- through operations instead.
  if new.requested_by is null then
    return new;
  end if;

  select codes.code, records.kind, years.year
  into record_code, record_kind, record_year
  from public.catalogue_records as records
  join public.catalogue_codes as codes on codes.id = records.code_id
  join public.academic_years as years on years.id = records.academic_year_id
  where records.id = new.record_id;

  record_path := '/admin/' || case record_kind
    when 'course' then 'courses'
    when 'programme' then 'programmes'
    when 'major' then 'majors'
    when 'minor' then 'minors'
    else 'specialisations'
  end || '/' || record_year || '/' || lower(record_code);

  if new.status = 'failed' then
    perform private.record_notification(
      new.requested_by,
      'catalogue_sync',
      record_code || ' sync failed',
      coalesce(new.error_message, 'The ANU sync did not finish.'),
      '/admin/operations/catalogue/syncs/' || new.id::text,
      'catalogue-sync:' || new.id::text
    );
    return new;
  end if;

  select count(*) into change_count
  from public.catalogue_sync_changes as changes
  where changes.sync_id = new.id
    and changes.classification in ('source_change', 'conflict');

  if new.status = 'review_required' and coalesce(change_count, 0) > 0 then
    perform private.record_notification(
      new.requested_by,
      'catalogue_sync',
      record_code || ' has ' || change_count || ' ANU '
        || case when change_count = 1 then 'change' else 'changes' end
        || ' to review',
      'ANU published different information for ' || record_year || '.',
      record_path || '/changes',
      'catalogue-sync:' || new.id::text
    );
  end if;
  return new;
end;
$function$;

create trigger catalogue_syncs_notify_finished
after update of status on public.catalogue_syncs
for each row
when (
  old.status is distinct from new.status
  and new.status in ('failed', 'review_required')
)
execute function private.notify_catalogue_sync_finished();

comment on function private.notify_catalogue_sync_finished() is
  'Tells the administrator who asked that their record needs attention.';

commit;
