begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'catalogue_listings', 'catalogue_listings exists');
select has_table('public', 'catalogue_discovery_checks', 'catalogue_discovery_checks exists');
select has_table('public', 'catalogue_discovery_check_source_pages', 'discovery source references exist');
select col_not_null('public', 'catalogue_listings', 'record_id', 'every listing references a record');
select col_not_null('public', 'catalogue_discovery_checks', 'is_complete', 'discovery completeness is explicit');
select ok(not has_table_privilege('anon', 'public.catalogue_listings', 'select'), 'anonymous users cannot read ANU listings');
select ok(not has_table_privilege('anon', 'public.catalogue_discovery_checks', 'select'), 'anonymous users cannot read discovery checks');
select ok(not has_table_privilege('anon', 'public.catalogue_discovery_check_source_pages', 'select'), 'anonymous users cannot read discovery source references');
select ok(has_table_privilege('authenticated', 'public.catalogue_listings', 'select'), 'authenticated administrators can be authorised to read listings');
select ok(has_table_privilege('authenticated', 'public.catalogue_discovery_checks', 'select'), 'authenticated administrators can be authorised to read discovery checks');

select * from finish();
rollback;
