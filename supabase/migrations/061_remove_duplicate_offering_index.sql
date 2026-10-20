begin;

-- The retained unique index has the same version_id key and still owns its constraint.
-- Reject metadata drift before removing the redundant non-unique index.
set local lock_timeout = '3s';
set local statement_timeout = '15s';
do $guard$
declare item jsonb; candidate pg_index%rowtype; retained pg_index%rowtype;
begin
  for item in select * from jsonb_array_elements('[{"candidate": "course_offerings_course_snapshot_fk_idx", "retained": "course_offerings_course_snapshot_unique", "candidateDefinition": "CREATE INDEX course_offerings_course_snapshot_fk_idx ON public.course_offerings USING btree (version_id)", "retainedDefinition": "CREATE UNIQUE INDEX course_offerings_course_snapshot_unique ON public.course_offerings USING btree (version_id)"}]'::jsonb) loop
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
drop index public.course_offerings_course_snapshot_fk_idx;

commit;
