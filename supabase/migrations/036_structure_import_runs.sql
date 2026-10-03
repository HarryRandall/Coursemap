-- Keep existing run URLs and accounting while adding the structure directories.
alter table public.catalogue_course_runs
  add column kind text not null default 'course',
  add constraint catalogue_course_runs_kind_check
    check (kind in ('course', 'major', 'minor', 'specialisation'));

create function private.check_catalogue_run_item_kind()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.catalogue_course_runs runs
    join public.catalogue_records records on records.id = new.record_id
    join public.academic_years years on years.id = records.academic_year_id
    join public.catalogue_syncs syncs on syncs.id = new.sync_id and syncs.record_id = records.id
    where runs.id = new.run_id and records.kind = runs.kind and years.year = runs.academic_year
  ) then
    raise exception 'The import item must match the run kind, year and sync record.';
  end if;
  return new;
end;
$$;
revoke all on function private.check_catalogue_run_item_kind() from public, anon, authenticated;
create trigger catalogue_run_item_kind before insert or update on public.catalogue_course_run_items
  for each row execute function private.check_catalogue_run_item_kind();
