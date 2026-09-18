begin;

-- The course and academic-structure import pipelines, the section-approval
-- review layer and the manual snapshot editors are replaced by one unified
-- pipeline on a shared catalogue model. This migration removes the retired
-- database surface so the replacement can be built without adapting it twice.
-- The course and academic-structure identity, year, snapshot and rule tables
-- remain for the student-facing reads until the shared model replaces them.

-- Administrative and import functions -----------------------------------------

drop function public.accept_course_import_target(uuid, bigint, bigint, text);
drop function public.reject_course_import_target(uuid, text);
drop function public.fail_expired_course_import_targets(uuid);
drop function public.start_course_import(smallint, text[], text, text, text, text);
drop function public.start_academic_structure_import(smallint, text, text[], text, text, text, text);
drop function public.cancel_academic_structure_import(uuid);
drop function public.reconcile_academic_structure_import_dispatch(uuid);
drop function public.review_academic_structure_import_target(uuid, text, text);
drop function public.apply_catalogue_import_changes(text, uuid, bigint, text[]);
drop function public.catalogue_import_comparison(text, uuid);
drop function public.catalogue_review_history(text, bigint);
drop function public.catalogue_review_state(text, bigint, bigint);
drop function public.review_catalogue_sections(text, bigint, bigint, text[], boolean, boolean);
drop function public.restore_catalogue_version(text, bigint, uuid, bigint);
drop function public.admin_catalogue_projection(text, bigint);
drop function public.confirm_course_manual_snapshot(bigint, bigint, jsonb, uuid[], text);
drop function public.create_course_manual_snapshot(bigint, bigint, jsonb);
drop function public.create_academic_structure_manual_snapshot(bigint, bigint, jsonb);
drop function public.publish_course_snapshot(bigint, bigint, bigint);
drop function public.publish_academic_structure_snapshot(bigint, bigint);
drop function public.archive_course_year(bigint, bigint, bigint);

drop function private.abandon_academic_structure_import_review_items(uuid, text);
drop function private.claim_academic_structure_import_target(uuid, uuid, text, uuid, integer);
drop function private.claim_course_import_target(uuid, uuid, text, uuid, integer);
drop function private.finish_academic_structure_import_target(uuid, uuid, text, uuid, integer, text, text, bigint, bigint, bigint, bigint, text, text);
drop function private.finish_course_import_target(uuid, uuid, text, uuid, integer, text, text, bigint, bigint, bigint, bigint, text, text);
drop function private.heartbeat_course_import_target(uuid, uuid, text, uuid, integer, integer);
drop function private.recover_stale_academic_structure_import_target(uuid, uuid);
drop function private.recover_stale_course_import_target(uuid, uuid);
drop function private.refresh_academic_structure_import_run(uuid);
drop function private.refresh_course_import_run(uuid);
drop function private.perform_publish_course_snapshot(bigint, bigint, bigint);
drop function private.persist_course_manual_snapshot(bigint, bigint, jsonb);
drop function private.academic_structure_manual_projection(bigint);
drop function private.validate_academic_structure_manual_projection(jsonb, text, text, smallint);
drop function private.validate_course_snapshot_projection(jsonb, text, smallint);
drop function private.course_snapshot_projection_diff(jsonb, jsonb, text);
drop function private.course_snapshot_projection_sha256(jsonb);
drop function private.canonical_jsonb_text(jsonb);
drop function private.catalogue_review_sections(text, bigint);
drop function private.catalogue_review_content(jsonb);
drop function private.jsonb_positions_are_contiguous(jsonb, text);
drop function private.jsonb_has_exact_keys(jsonb, text[]);
drop function private.jsonb_is_boolean(jsonb, boolean);
drop function private.jsonb_is_number(jsonb, boolean, boolean);
drop function private.jsonb_is_text(jsonb, boolean, boolean);

-- Triggers on retained tables that belonged to the removed layers ---------------

drop trigger course_year_review_guard on public.course_years;
drop trigger structure_year_review_guard on public.academic_structure_years;
drop function private.catalogue_review_pointer_guard();

drop trigger course_snapshots_preserve_manual_review_state on public.course_snapshots;
drop function private.preserve_manual_snapshot_review_state();

drop trigger course_snapshot_field_evidence_preserve_manual_source
  on public.course_snapshot_field_evidence;
drop function private.preserve_manual_snapshot_source_evidence();

drop trigger academic_structure_snapshots_register_assembly
  on public.academic_structure_snapshots;
drop function private.register_academic_structure_snapshot_assembly();

-- The child-insert guard required an assembly registration from the removed
-- pipeline. Projected rows still cannot be appended once a snapshot is the
-- draft or the published version.
create or replace function private.guard_academic_structure_snapshot_child_insert()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  draft_snapshot_id bigint;
  published_snapshot_id bigint;
begin
  select structure_years.draft_snapshot_id, structure_years.published_snapshot_id
  into draft_snapshot_id, published_snapshot_id
  from public.academic_structure_snapshots as snapshots
  join public.academic_structure_years as structure_years
    on structure_years.id = snapshots.structure_year_id
  where snapshots.id = new.snapshot_id
  for share of snapshots, structure_years;

  if not found then
    -- Preserve the child table's normal foreign-key error for a missing
    -- snapshot instead of replacing it with an immutability error.
    return new;
  end if;

  if draft_snapshot_id is not distinct from new.snapshot_id
     or published_snapshot_id is not distinct from new.snapshot_id then
    raise exception using
      errcode = '55000',
      message = 'Academic structure projected rows may only be inserted while their snapshot is being assembled.';
  end if;

  return new;
end;
$function$;

-- The model catalogue guard also validated the model requested by import runs.
-- Only the model and default-setting branches remain.
create or replace function private.guard_import_model_catalogue()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(78241309);
  if tg_table_name = 'import_models' then
    if new.id <> old.id then
      raise exception 'The model identifier cannot be changed.' using errcode = '22023';
    end if;
    if not new.enabled and exists (
      select 1 from public.app_settings where key = 'imports.model' and value = to_jsonb(old.id)
    ) then
      raise exception 'Choose another default model before removing this model.' using errcode = '22023';
    end if;
    if not new.visible and exists (
      select 1 from public.app_settings where key = 'imports.model' and value = to_jsonb(old.id)
    ) then
      raise exception 'Choose another default model before hiding this model.' using errcode = '22023';
    end if;
  elsif tg_table_name = 'app_settings' then
    if new.key = 'imports.model' and not exists (
      select 1 from public.import_models where id = new.value #>> '{}' and enabled and visible
    ) then
      raise exception 'Choose an enabled import model.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$function$;

-- Import, review and directory tables -------------------------------------------

drop view public.course_directory_admin_entries;
drop view public.course_directory_latest_import_targets;
drop view public.academic_structure_directory_latest_import_targets;

alter table public.academic_structure_snapshots
  drop column import_target_id;

drop table public.course_snapshot_confirmation_items;
drop table public.course_snapshot_confirmations;
drop table private.course_snapshot_confirmation_contexts;
drop table private.academic_structure_snapshot_assemblies;
drop table public.catalogue_section_reviews;

drop table public.course_review_items;
drop table public.course_extractions;
drop table public.course_import_artifacts;
drop table public.course_import_stages;
drop table public.course_import_targets;
drop table public.course_import_runs;
drop table public.course_directory_entries;

drop table public.academic_structure_review_items;
drop table public.academic_structure_extractions;
drop table public.academic_structure_import_artifacts;
drop table public.academic_structure_import_stages;
drop table public.academic_structure_import_targets;
drop table public.academic_structure_import_runs;
drop table public.academic_structure_directory_entries;
drop table public.academic_structure_directory_statuses;

-- Trigger functions whose only tables were removed above.
drop function private.check_course_import_target_count();
drop function private.ensure_catalogue_directory_identity();
drop function private.prepare_first_course_import_draft();
drop function private.prepare_first_structure_import_draft();
drop function private.prevent_implicit_course_review_resolution();
drop function private.validate_academic_structure_import_target_transition();
drop function private.validate_course_extraction_lifecycle();
drop function private.validate_course_import_stage_transition();
drop function private.validate_course_import_target();
drop function private.validate_course_review_item();
drop function private.validate_import_run_status_transition();

commit;
