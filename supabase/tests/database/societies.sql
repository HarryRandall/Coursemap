begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(9);

insert into public.societies (id,slug,source,source_id,name,short_name,category,summary,overview,source_url,fetched_at,source_hash,status) values
('aa000000-0000-4000-8000-000000000001','society-policy-test','test','published','Test club','Test','Academic','Test','Test','https://example.test',now(),repeat('a',64),'published'),
('aa000000-0000-4000-8000-000000000002','society-policy-archived','test','archived','Archived club','Archived','Academic','Test','Test','https://example.test',now(),repeat('b',64),'archived');
insert into public.society_events (id,society_id,source,source_id,title,category,starts_at,ends_at,location,description,source_url,fetched_at,source_hash,status) values
('ab000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','test','published','Public event','social','2199-01-01 12:00+11','2199-01-01 14:00+11','Test','Test','https://example.test',now(),repeat('a',64),'published'),
('ab000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001','test','archived','Archived event','social','2199-01-01 12:00+11','2199-01-01 14:00+11','Test','Test','https://example.test',now(),repeat('b',64),'archived'),
('ab000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-000000000002','test','hidden-organiser','Hidden organiser event','social','2199-01-01 12:00+11','2199-01-01 14:00+11','Test','Test','https://example.test',now(),repeat('c',64),'published');

select extensions.throws_ok($$ update public.society_events set society_id = 'aa000000-0000-4000-8000-000000000099' where source = 'test' $$,'23503',null,'Events cannot reference a missing club');
select extensions.throws_ok($$ update public.society_events set ends_at = starts_at where source = 'test' $$,'23514',null,'Events require a positive duration');
select extensions.throws_ok($$ delete from public.societies where id = 'aa000000-0000-4000-8000-000000000001' $$,'23503',null,'Clubs with events cannot be deleted');
set local role anon;
select extensions.is((select count(*) from public.societies where source = 'test'),1::bigint,'Anonymous reads exclude archived clubs');
select extensions.is((select count(*) from public.society_events where source = 'test'),1::bigint,'Anonymous reads exclude archived events and organisers');
select extensions.throws_ok($$ update public.society_events set title = 'Changed' where source = 'test' $$,'42501',null,'Anonymous clients cannot write events');
reset role;
set local role authenticated;
select extensions.is((select count(*) from public.society_events where source = 'test'),1::bigint,'Signed-in reads also exclude unpublished records');
select extensions.throws_ok($$ delete from public.societies where source = 'test' $$,'42501',null,'Signed-in clients cannot delete clubs');
select extensions.throws_ok($$ insert into public.society_events default values $$,'42501',null,'Signed-in clients cannot insert events');
reset role;
select * from extensions.finish();
rollback;
