begin;

-- A manual edit must not clear the publication gate.
--
-- catalogue_publish_blockers() looked for open review entries by joining
-- catalogue_import_changes on the draft snapshot's import_target_id. Only
-- persist-snapshot.ts and apply-review.ts ever set that column, so any draft
-- produced by lib/catalogue-import/manual-snapshot.ts carries null and the
-- join matched nothing. Opening a review with a blocking flag and making one
-- trivial manual edit therefore produced a draft with no target, an empty
-- blocker list and a Publish button that worked. Open changes on fields the
-- edit never touched disappeared from the gate the same way.
--
-- The fix resolves the review through the item year rather than through the
-- draft. Two targets govern a record: the most recent one that produced a
-- review, and whichever target the current draft descends from. The first
-- catches the manual-edit bypass and also the plainer hole where a ready
-- target has never been applied, so its open changes never gated anything.
-- The second preserves the previous behaviour for an applied review whose
-- flags are still open.
--
-- Carrying import_target_id into manual snapshots was the alternative. It was
-- rejected because it does not actually close the hole: an import against a
-- record that already has a draft leaves the draft pointer alone, so the
-- draft descends from the *previous* target, and carrying that one through an
-- edit still misses the review that is open now. It would also put import
-- provenance on a snapshot whose origin is 'manual'.

create or replace function public.catalogue_publish_blockers(p_item_year_id bigint)
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  with item_year as (
    select * from public.catalogue_item_years where id = p_item_year_id
  ),
  draft as (
    select snapshots.* from public.catalogue_snapshots as snapshots
    join item_year on item_year.draft_snapshot_id = snapshots.id
  ),
  latest_review as (
    select targets.id
    from public.catalogue_import_targets as targets
    join item_year on item_year.id = targets.item_year_id
    where targets.status in ('ready', 'unchanged')
    order by targets.created_at desc, targets.id desc
    limit 1
  ),
  review as (
    select id from latest_review
    union
    select import_target_id from draft where import_target_id is not null
  )
  select array_remove(array[
    case when not exists (select 1 from item_year) then 'The record does not exist.' end,
    case when exists (select 1 from item_year where archived_at is not null) then 'The record is archived.' end,
    case when exists (select 1 from item_year where draft_snapshot_id is null) then 'There is no draft to publish.' end,

    case when exists (
      select 1 from review
      join public.catalogue_import_changes as changes on changes.target_id = review.id
      where changes.entry_kind = 'flag' and changes.is_blocking and changes.status = 'open'
    ) then 'A blocking flag on the import review is still open.' end,
    case when exists (
      select 1 from review
      join public.catalogue_import_changes as changes on changes.target_id = review.id
      where changes.entry_kind = 'change' and changes.status = 'open'
    ) then 'The import review still has open changes.' end
  ], null);
$function$;

revoke all on function public.catalogue_publish_blockers(bigint) from public, anon;
grant execute on function public.catalogue_publish_blockers(bigint) to authenticated;

comment on function public.catalogue_publish_blockers(bigint) is
  'Reasons the draft of an item year cannot be published, resolved through the item year''s import review rather than through the draft snapshot alone.';

-- The gate reads targets by item year and status; the existing item-year index
-- does not carry status.
create index if not exists catalogue_import_targets_item_year_status_idx
  on public.catalogue_import_targets (item_year_id, status, created_at desc);

commit;
