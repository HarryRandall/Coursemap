-- Two integrity gaps in requirement_conditions.
--
-- 1. code_id referenced catalogue_codes (id) alone, the only child table in the
--    model that skipped the composite (id, kind) pattern used everywhere else
--    (catalogue_records, catalogue_versions, both detail tables,
--    catalogue_directory_entries, catalogue_import_targets and, notably, the
--    sibling requirement_condition_options). A condition_kind = 'course' row
--    could therefore point at a programme and silently corrupt the requirement.
--
-- 2. requirement_conditions_requirement_mode_check evaluated to NULL rather
--    than false when condition_kind = 'course' and requirement_mode was null,
--    so the CHECK passed. course-types.ts types the column as non-nullable and
--    planner.ts compares it to 'completed_or_concurrent', so a null silently
--    degraded a corequisite into a prerequisite.

alter table public.requirement_conditions
  add column item_kind text;

-- Backfilling a new column is not a content change, but the sealed-snapshot
-- guard cannot tell the difference, so it is suspended for the statement.
alter table public.requirement_conditions
  disable trigger requirement_conditions_guard_sealed;

update public.requirement_conditions as conditions
   set item_kind = items.kind
  from public.catalogue_codes as items
 where items.id = conditions.code_id
   and conditions.code_id is not null;

alter table public.requirement_conditions
  enable trigger requirement_conditions_guard_sealed;

alter table public.requirement_conditions
  drop constraint requirement_conditions_item_fkey;

alter table public.requirement_conditions
  add constraint requirement_conditions_item_fkey
    foreign key (code_id, item_kind) references public.catalogue_codes (id, kind);

-- item_kind travels with code_id and must suit the condition that carries it.
alter table public.requirement_conditions
  add constraint requirement_conditions_item_kind_check check (
    (code_id is null and item_kind is null)
    or (
      code_id is not null
      and item_kind is not null
      and case
        when condition_kind in ('course', 'incompatible') then item_kind = 'course'
        when condition_kind = 'structure'
          then item_kind in ('programme', 'major', 'minor', 'specialisation')
        else false
      end
    )
  );

-- A course condition needs a mode; every other kind must leave it null.
alter table public.requirement_conditions
  drop constraint requirement_conditions_requirement_mode_check;

alter table public.requirement_conditions
  add constraint requirement_conditions_requirement_mode_check check (
    (condition_kind = 'course') = (requirement_mode is not null)
    and (
      requirement_mode is null
      or requirement_mode in ('completed', 'completed_or_concurrent')
    )
  );
