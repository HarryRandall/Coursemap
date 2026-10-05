-- AI-free runs preserve deterministic source data and hold ambiguous requirements for review.
alter table public.catalogue_course_runs
  add column allow_ai boolean not null default true;
