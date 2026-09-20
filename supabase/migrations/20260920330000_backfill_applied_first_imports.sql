begin;

-- A first import records itself as applied.
--
-- When a target has no baseline its changes are recorded as already accepted
-- and the candidate becomes the draft without anyone pressing Apply, so
-- applied_snapshot_id was never set. The target then kept reporting "ready",
-- which the import runs list showed as "Ready for review" for a record that
-- had since been published. persist-snapshot.ts now sets it at the point the
-- candidate becomes the draft; this backfills the rows written before that.
--
-- Only targets whose candidate is still the record's draft or published
-- snapshot are touched. A candidate that was superseded was never applied.

update public.catalogue_import_targets as targets
set applied_snapshot_id = targets.candidate_snapshot_id,
    applied_at = coalesce(targets.applied_at, targets.completed_at, now())
from public.catalogue_item_years as item_years
where item_years.id = targets.item_year_id
  and targets.change_kind = 'new'
  and targets.applied_snapshot_id is null
  and targets.candidate_snapshot_id is not null
  and targets.candidate_snapshot_id in (
    item_years.draft_snapshot_id,
    item_years.published_snapshot_id
  );

commit;
