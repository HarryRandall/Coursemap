-- Selection follows the remaining catalogue; the spending limit bounds paid work.
alter table public.catalogue_course_runs
  drop constraint catalogue_course_runs_course_limit_check,
  add constraint catalogue_course_runs_course_limit_check check (course_limit >= 1);
