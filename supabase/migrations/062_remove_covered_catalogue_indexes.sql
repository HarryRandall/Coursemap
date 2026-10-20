begin;

-- Retained unique indexes cover these leading version_id keys.
-- Exact key, constraint, dependency and readiness guards reject unexpected schema drift.
set local lock_timeout = '3s';
set local statement_timeout = '15s';
do $guard$
declare item jsonb; candidate pg_index%rowtype; retained pg_index%rowtype;
begin
  for item in select * from jsonb_array_elements('[{"candidate": "course_learning_outcomes_course_snapshot_fk_idx", "retained": "course_learning_outcomes_snapshot_position_unique", "candidateDefinition": "CREATE INDEX course_learning_outcomes_course_snapshot_fk_idx ON public.course_learning_outcomes USING btree (version_id)", "retainedDefinition": "CREATE UNIQUE INDEX course_learning_outcomes_snapshot_position_unique ON public.course_learning_outcomes USING btree (version_id, \"position\")"}, {"candidate": "course_fees_course_snapshot_id_idx", "retained": "course_fees_snapshot_position_unique", "candidateDefinition": "CREATE INDEX course_fees_course_snapshot_id_idx ON public.course_fees USING btree (version_id)", "retainedDefinition": "CREATE UNIQUE INDEX course_fees_snapshot_position_unique ON public.course_fees USING btree (version_id, \"position\")"}, {"candidate": "course_assessment_items_course_snapshot_fk_idx", "retained": "course_assessment_items_snapshot_position_unique", "candidateDefinition": "CREATE INDEX course_assessment_items_course_snapshot_fk_idx ON public.course_assessment_items USING btree (version_id)", "retainedDefinition": "CREATE UNIQUE INDEX course_assessment_items_snapshot_position_unique ON public.course_assessment_items USING btree (version_id, \"position\")"}, {"candidate": "course_areas_of_interest_course_snapshot_id_idx", "retained": "course_areas_of_interest_snapshot_name_unique", "candidateDefinition": "CREATE INDEX course_areas_of_interest_course_snapshot_id_idx ON public.course_areas_of_interest USING btree (version_id)", "retainedDefinition": "CREATE UNIQUE INDEX course_areas_of_interest_snapshot_name_unique ON public.course_areas_of_interest USING btree (version_id, name)"}, {"candidate": "requirement_rules_snapshot_idx", "retained": "requirement_rules_snapshot_kind_unique", "candidateDefinition": "CREATE INDEX requirement_rules_snapshot_idx ON public.requirement_rules USING btree (version_id)", "retainedDefinition": "CREATE UNIQUE INDEX requirement_rules_snapshot_kind_unique ON public.requirement_rules USING btree (version_id, rule_kind)"}, {"candidate": "offering_sessions_course_snapshot_id_idx", "retained": "offering_sessions_snapshot_position_unique", "candidateDefinition": "CREATE INDEX offering_sessions_course_snapshot_id_idx ON public.offering_sessions USING btree (version_id)", "retainedDefinition": "CREATE UNIQUE INDEX offering_sessions_snapshot_position_unique ON public.offering_sessions USING btree (version_id, \"position\")"}]'::jsonb) loop
    select * into strict candidate from pg_index where indexrelid = to_regclass('public.' || (item->>'candidate'));
    select * into strict retained from pg_index where indexrelid = to_regclass('public.' || (item->>'retained'));
    if pg_get_indexdef(candidate.indexrelid) <> item->>'candidateDefinition'
       or pg_get_indexdef(retained.indexrelid) <> item->>'retainedDefinition'
       or candidate.indrelid <> retained.indrelid
       or not(candidate.indisvalid and candidate.indisready and candidate.indislive
              and retained.indisvalid and retained.indisready and retained.indislive)
       or candidate.indisunique or candidate.indisprimary or candidate.indisexclusion
       or candidate.indisreplident or candidate.indisclustered
       or candidate.indpred is not null or retained.indpred is not null
       or candidate.indexprs is not null or retained.indexprs is not null
       or candidate.indnatts <> candidate.indnkeyatts
       or candidate.indnkeyatts > retained.indnkeyatts
       or exists (select 1 from generate_series(0,candidate.indnkeyatts-1) k
          where candidate.indkey[k] <> retained.indkey[k]
             or candidate.indclass[k] <> retained.indclass[k]
             or candidate.indcollation[k] <> retained.indcollation[k]
             or candidate.indoption[k] <> retained.indoption[k])
       or exists (select 1 from pg_constraint where conindid=candidate.indexrelid)
       or exists (select 1 from pg_depend where refclassid='pg_class'::regclass and refobjid=candidate.indexrelid)
       or exists (select 1 from pg_inherits where inhrelid=candidate.indexrelid or inhparent=candidate.indexrelid)
       or exists (select 1 from pg_class where oid in(candidate.indexrelid,retained.indexrelid) and (relkind<>'i' or reloptions is not null or reltablespace<>0))
    then raise exception 'Index removal precondition drift for %', item->>'candidate'; end if;
  end loop;
end
$guard$;
drop index public.course_learning_outcomes_course_snapshot_fk_idx;
drop index public.course_fees_course_snapshot_id_idx;
drop index public.course_assessment_items_course_snapshot_fk_idx;
drop index public.course_areas_of_interest_course_snapshot_id_idx;
drop index public.requirement_rules_snapshot_idx;
drop index public.offering_sessions_course_snapshot_id_idx;

commit;
