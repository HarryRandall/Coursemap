-- Older completed imports may predate automatic first-draft preparation.
-- Only empty workspaces are initialised; review issues and publication stay intact.
with candidates as (
  select distinct on (target.course_year_id)
    target.course_year_id, target.candidate_snapshot_id
  from public.course_import_targets as target
  join public.course_snapshots as snapshot
    on snapshot.id = target.candidate_snapshot_id
    and snapshot.course_year_id = target.course_year_id
  where target.processing_status = 'ready_for_review'
    and target.review_status = 'pending'
    and target.baseline_draft_snapshot_id is null
    and target.baseline_published_snapshot_id is null
    and snapshot.sealed_at is not null
    and snapshot.validation_status in ('valid', 'valid_with_warnings')
  order by target.course_year_id, target.created_at desc, target.id desc
)
update public.course_years as course_year
set draft_snapshot_id = candidates.candidate_snapshot_id
from candidates
where course_year.id = candidates.course_year_id
  and course_year.lifecycle_status = 'active'
  and course_year.draft_snapshot_id is null
  and course_year.published_snapshot_id is null;

with candidates as (
  select distinct on (target.structure_year_id)
    target.structure_year_id, target.candidate_snapshot_id
  from public.academic_structure_import_targets as target
  join public.academic_structure_snapshots as snapshot
    on snapshot.id = target.candidate_snapshot_id
    and snapshot.structure_year_id = target.structure_year_id
  where target.processing_status = 'succeeded'
    and target.review_status = 'needs_review'
    and target.baseline_draft_snapshot_id is null
    and target.baseline_published_snapshot_id is null
  order by target.structure_year_id, target.created_at desc, target.id desc
)
update public.academic_structure_years as structure_year
set draft_snapshot_id = candidates.candidate_snapshot_id, updated_at = now()
from candidates
where structure_year.id = candidates.structure_year_id
  and structure_year.draft_snapshot_id is null
  and structure_year.published_snapshot_id is null;
