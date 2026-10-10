begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(14);

select extensions.has_index('public', 'catalogue_versions', 'catalogue_versions_sync_idx', 'source versions have a sync lookup index');
select extensions.has_index('public', 'catalogue_sync_changes', 'catalogue_sync_changes_current_record_position_idx', 'current review rows have an ordered record index');
select extensions.has_index('public', 'catalogue_records', 'catalogue_records_live_code_idx', 'live publications have a code lookup index');

select extensions.has_index('public', 'requirement_condition_options', 'requirement_condition_options_version_idx', 'requirement options have a version lookup index');
select extensions.has_index('public', 'requirement_item_references', 'requirement_item_references_version_idx', 'requirement references have a version lookup index');
select extensions.has_index('public', 'course_assessment_outcomes', 'course_assessment_outcomes_version_idx', 'assessment links have a version lookup index');

select extensions.ok((
  select indisvalid and pg_get_expr(indpred, indrelid) = '(sync_id IS NOT NULL)'
  from pg_index where indexrelid = 'public.catalogue_versions_sync_idx'::regclass
), 'only source versions occupy the sync index');
select extensions.ok((
  select indisvalid and pg_get_expr(indpred, indrelid) = '(superseded_at IS NULL)'
  from pg_index where indexrelid = 'public.catalogue_sync_changes_current_record_position_idx'::regclass
), 'the current-review index includes decided rows');
select extensions.ok((
  select indisvalid and pg_get_expr(indpred, indrelid) = '((published_version_id IS NOT NULL) AND (archived_at IS NULL))'
  from pg_index where indexrelid = 'public.catalogue_records_live_code_idx'::regclass
), 'code visibility indexes only live publications');

-- Small test databases favour sequential scans. This checks index eligibility,
-- not the cost-based choice that the owner measures with production EXPLAIN.
set local enable_seqscan = off;
create function pg_temp.review_plan() returns jsonb
language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  execute $query$
    explain (format json)
    with current_review as materialized (
      select sync_id from public.catalogue_sync_changes
      where record_id = 1 and superseded_at is null
      order by position limit 1
    ), source_version as materialized (
      select versions.id, versions.based_on_version_id
      from public.catalogue_versions as versions
      join current_review on current_review.sync_id = versions.sync_id
    )
    select changes.id, versions.id as source_version_id
    from current_review join source_version as versions on true
    join public.catalogue_sync_changes as changes on changes.sync_id = current_review.sync_id
    where changes.record_id = 1 and changes.superseded_at is null
    order by changes.position
  $query$ into result;
  return result;
end;
$$;
select extensions.ok(pg_temp.review_plan()::text like '%catalogue_sync_changes_current_record_position_idx%', 'the current-review query can use its record and position index');
select extensions.ok(pg_temp.review_plan()::text like '%catalogue_versions_sync_idx%', 'the review resolves its source version through the sync index');

create function pg_temp.projection_plan(query text) returns jsonb
language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  execute 'explain (format json) ' || query into result;
  return result;
end;
$$;
select extensions.ok(pg_temp.projection_plan('select condition_id, position from public.requirement_condition_options where version_id = 1')::text like '%requirement_condition_options_version_idx%', 'option projections can use a version index');
select extensions.ok(pg_temp.projection_plan('select rule_id, code_id from public.requirement_item_references where version_id = 1')::text like '%requirement_item_references_version_idx%', 'reference projections can use a version index');
select extensions.ok(pg_temp.projection_plan('select assessment_item_id, learning_outcome_id from public.course_assessment_outcomes where version_id = 1')::text like '%course_assessment_outcomes_version_idx%', 'assessment link projections can use a version index');

select * from extensions.finish();
rollback;
