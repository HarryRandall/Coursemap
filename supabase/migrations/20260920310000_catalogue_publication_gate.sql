begin;

-- A manual version must not clear the publication gate.
--
-- catalogue_publish_blockers() must consider both the latest review and the
-- version selected by that review. Manual versions do not have an import
-- target, so resolving only through version provenance would let an open
-- review disappear from the gate.
--
-- Two targets can therefore govern a record: the most recent one that
-- produced a review, and whichever target produced the latest applied
-- version. This also covers a ready target that has not yet been applied.

create or replace function public.catalogue_publish_blockers(p_record_id bigint)
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  with item_year as (
    select * from public.catalogue_records where id = p_record_id
  ),
  publishable_version as (
    select versions.*
    from public.catalogue_versions as versions
    join item_year on item_year.id = versions.record_id
    left join public.catalogue_import_targets as targets
      on targets.id = versions.import_target_id
    where versions.sealed_at is not null
      and (
        versions.import_target_id is null
        or targets.applied_version_id = versions.id
      )
    order by versions.created_at desc, versions.id desc
    limit 1
  ),
  latest_review as (
    select targets.id
    from public.catalogue_import_targets as targets
    join item_year on item_year.id = targets.record_id
    where targets.status in ('ready', 'unchanged')
    order by targets.created_at desc, targets.id desc
    limit 1
  ),
  review as (
    select id from latest_review
    union
    select import_target_id
    from publishable_version
    where import_target_id is not null
  )
  select array_remove(array[
    case when not exists (select 1 from item_year) then 'The record does not exist.' end,
    case when exists (select 1 from item_year where archived_at is not null) then 'The record is archived.' end,
    case when not exists (select 1 from publishable_version) then 'There is no version to publish.' end,

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
  'Reasons the latest applied version of a catalogue record cannot be published.';

-- The gate reads targets by record and status; the existing record index does
-- not carry status.
create index if not exists catalogue_import_targets_item_year_status_idx
  on public.catalogue_import_targets (record_id, status, created_at desc);

commit;
