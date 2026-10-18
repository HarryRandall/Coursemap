begin;
\ir ../helpers/catalogue-fixtures.inc
create extension if not exists pgtap with schema extensions;
select extensions.plan(17);

insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('59000000-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid,
  'authenticated','authenticated','admin-read-' || value || '@example.test','{}'::jsonb,'{}'::jsonb,now(),now()
from generate_series(1,4) as value;
update private.user_roles set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '59000000-0000-4000-8000-000000000003';
insert into private.app_roles(key,name,description) values('projection_student_reader','Projection student reader','Student records only.');
insert into private.role_permissions(role_id,permission_id)
select roles.id,permissions.id from private.app_roles as roles,private.app_permissions as permissions
where roles.key = 'projection_student_reader' and permissions.key = 'students.read';
update private.user_roles set role_id = (select id from private.app_roles where key = 'projection_student_reader')
where user_id = '59000000-0000-4000-8000-000000000004';

select pg_temp.create_course_snapshot('ADMN' || value::text,2026::smallint,'Human-Centred and Creative Computing')
from generate_series(1001,1052) as value;
insert into public.catalogue_listings(academic_year_id,kind,code,code_id,record_id,title)
select records.academic_year_id,'course',codes.code,codes.id,records.id,'Human-Centred and Creative Computing'
from public.catalogue_records as records join public.catalogue_codes as codes on codes.id=records.code_id
where codes.code between 'ADMN1001' and 'ADMN1052';
select pg_temp.publish_snapshot(versions.id) from public.catalogue_versions as versions
join public.catalogue_records as records on records.id=versions.record_id
join public.catalogue_codes as codes on codes.id=records.code_id where codes.code='ADMN1001';
select pg_temp.publish_course('ADMN1001',2027::smallint);
insert into public.catalogue_drafts(record_id,content,content_hash)
select records.id,'{}'::jsonb,repeat('a',64) from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id=records.code_id
join public.academic_years as years on years.id=records.academic_year_id
where codes.code='ADMN1001' and years.year=2026;
update public.catalogue_listings set is_current=false where code='ADMN1002';
insert into public.catalogue_syncs(record_id,trigger,status,requested_model,parser_version,prompt_version,schema_version,created_at)
select records.id,'manual',history.status,(select id from public.import_models where enabled order by id limit 1),'fixture','fixture','fixture',history.created_at
from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id=records.code_id
join public.academic_years as years on years.id=records.academic_year_id
cross join (values ('failed'::text,now()-interval '1 day'),('unchanged',now())) as history(status,created_at)
where codes.code='ADMN1001' and years.year=2026;

insert into public.catalogue_syncs(record_id,trigger,status,requested_model,parser_version,prompt_version,schema_version)
select records.id,'manual','review_required',(select id from public.import_models where enabled order by id limit 1),'fixture','fixture','fixture'
from public.catalogue_records as records join public.catalogue_codes as codes on codes.id=records.code_id
where codes.code='ADMN1003';
insert into public.catalogue_sync_changes(sync_id,record_id,field_path,review_unit_kind,classification,local_value_hash,position,decision,resolved_at,superseded_at)
select syncs.id,syncs.record_id,'course.details.fixture' || changes.position,'scalar',changes.classification,repeat('a',64),changes.position,
  changes.decision,case when changes.decision is not null then now() end,case when changes.superseded then now() end
from public.catalogue_syncs as syncs join public.catalogue_records as records on records.id=syncs.record_id
join public.catalogue_codes as codes on codes.id=records.code_id
cross join (values (0,'conflict'::text,null::text,false),(1,'source_change',null,false),(2,'conflict','use_source',false),(3,'conflict',null,true)) as changes(position,classification,decision,superseded)
where codes.code='ADMN1003';

insert into public.plans(owner_id,name,commencement_year,study_load,academic_year_id)
select ('59000000-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid,'Fixture plan',2026,'full_time',years.id
from generate_series(1,2) as value cross join public.academic_years as years where years.year=2026;
insert into public.plan_items(plan_id,owner_id,catalogue_record_id)
select plans.id,plans.owner_id,records.id
from public.plans as plans cross join public.catalogue_records as records
join public.catalogue_codes as codes on codes.id=records.code_id
where plans.owner_id in ('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000002')
  and (codes.code='ADMN1001' or (codes.code='ADMN1002' and plans.owner_id='59000000-0000-4000-8000-000000000002'));

select extensions.ok(not has_function_privilege('anon','public.admin_catalogue_directory_page(text,smallint,text,text,integer)','execute'), 'anonymous readers cannot call the admin directory');
select extensions.ok(not has_function_privilege('anon','public.admin_top_courses(integer)','execute'), 'anonymous readers cannot call the student aggregate');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"59000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$select public.admin_catalogue_directory_page('course',2026::smallint)$$,'42501','Catalogue operations permission is required.','a normal student cannot read the private directory');
select extensions.throws_ok($$select * from public.admin_top_courses()$$,'42501','Student records permission is required.','a normal student cannot read other students course counts');

select set_config('request.jwt.claims','{"sub":"59000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select extensions.is((public.admin_catalogue_directory_page('course',2026::smallint,'ADMN',null,99)->>'total')::integer,52,'the directory counts every matching row');
select extensions.is((public.admin_catalogue_directory_page('course',2026::smallint,'ADMN',null,99)->>'page')::integer,2,'the directory clamps the requested page');
select extensions.is(jsonb_array_length(public.admin_catalogue_directory_page('course',2026::smallint,'ADMN',null,1)->'records'),50,'the directory transfers only one bounded page');
select extensions.is(jsonb_array_length(public.admin_catalogue_directory_page('course',2026::smallint,'ADMN',null,2)->'records'),2,'the final page retains the remaining records');
select extensions.is((public.admin_catalogue_directory_page('course',2026::smallint,'creative human ADMN','published')->>'total')::integer,1,'word search ignores order and punctuation and published includes a retained draft');
select extensions.is((public.admin_catalogue_directory_page('course',2026::smallint,'ADMN','draft')->>'total')::integer,1,'draft state follows the same badge precedence');
select extensions.is((public.admin_catalogue_directory_page('course',2026::smallint,'ADMN','delisted')->>'total')::integer,1,'delisted rows retain their state');
select extensions.is(public.admin_catalogue_directory_page('course',2026::smallint,'ADMN1001')->'records'->0->'latestSync'->>'status','unchanged','only the newest sync supplies the row status');
select extensions.is((public.admin_catalogue_directory_page('course',2026::smallint,'ADMN1003')->'records'->0->>'openChangeCount')::integer,2,'only unresolved unsuperseded source changes are counted');
select extensions.is((public.admin_catalogue_directory_page('course',2026::smallint,'ADMN1003')->'records'->0->>'conflictCount')::integer,1,'conflicts are counted separately');
select extensions.is((public.admin_catalogue_directory_page('course',2026::smallint,'ADMN','changes_available')->>'total')::integer,1,'change counts drive the same visible state filter');
select extensions.is((select students from public.admin_top_courses() where code='ADMN1001'),2::bigint,'a student planning two editions counts once');

select set_config('request.jwt.claims','{"sub":"59000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select extensions.is((select count(*) from public.admin_top_courses() where code='ADMN1002'),0::bigint,'student permission alone does not reveal someone elses unpublished catalogue record');
reset role;
select * from extensions.finish();
rollback;
