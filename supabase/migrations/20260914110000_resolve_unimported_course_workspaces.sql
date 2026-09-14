-- Directory links resolve the annual identity before an import fills course_id.
create or replace view public.course_directory_admin_entries
with (security_invoker = true)
as
select
  entries.id,
  entries.academic_year_id,
  entries.code,
  entries.title,
  entries.units,
  entries.academic_career,
  entries.session,
  entries.mode_of_delivery,
  entries.first_seen_at,
  entries.last_seen_at,
  entries.is_current,
  courses.id as course_id,
  course_years.id as course_year_id,
  course_years.draft_snapshot_id,
  course_years.published_snapshot_id,
  latest.id as latest_target_id,
  latest.run_id as latest_run_id,
  latest.processing_status as latest_processing_status,
  latest.review_status as latest_review_status,
  latest.change_kind as latest_change_kind,
  latest.error_summary as latest_error_summary,
  latest.created_at as latest_created_at
from public.course_directory_entries as entries
left join public.courses as courses on courses.code = entries.code
left join public.course_years as course_years
  on course_years.course_id = courses.id
 and course_years.academic_year_id = entries.academic_year_id
left join public.course_directory_latest_import_targets as latest
  on latest.directory_entry_id = entries.id;
