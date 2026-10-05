-- AI-free runs do not reserve or spend budget, while AI-enabled runs retain a bounded limit.
alter table public.catalogue_course_runs
  drop constraint catalogue_course_runs_budget_usd_check,
  add constraint catalogue_course_runs_budget_usd_check check (
    (allow_ai and budget_usd > 0 and budget_usd <= 10)
    or (not allow_ai and budget_usd = 0)
  );
