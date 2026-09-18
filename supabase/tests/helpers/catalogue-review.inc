-- Section approval no longer gates publication. The fixtures that called this
-- helper are rewritten with the shared catalogue model; until then the call
-- sites stay valid and do nothing.
create function pg_temp.approve_catalogue_fixture(kind text, snapshot_id bigint)
returns void language sql as $$ select null::void $$;
