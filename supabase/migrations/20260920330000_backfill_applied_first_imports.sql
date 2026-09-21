begin;

-- A first import records itself as applied.
--
-- When a target has no baseline its changes are recorded as already accepted
-- and the candidate becomes the applied version without anyone pressing Apply, so
-- applied_version_id was never set. The target then kept reporting "ready",
-- which the import runs list showed as "Ready for review" for a record that
-- had since been published. persist-snapshot.ts now sets it at the point the
-- candidate becomes current; this backfills the rows written before that.
--
update public.catalogue_import_targets as targets
set applied_version_id = targets.candidate_version_id,
    applied_at = coalesce(targets.applied_at, targets.completed_at, now())
where targets.change_kind = 'new'
  and targets.applied_version_id is null
  and targets.candidate_version_id is not null;

commit;
