begin;
\ir ../helpers/catalogue-fixtures.inc
create extension if not exists pgtap with schema extensions;
select extensions.plan(18);

select pg_temp.create_course_snapshot('PRJF1000', 2031::smallint) as live_fee \gset
update public.course_version_details set academic_career = 'UGRD', college = 'Fee fixture college' where version_id = :live_fee;
insert into public.course_fees(version_id, position, fee_year, audience, fee_type, amount, basis, source_text) values
  (:live_fee, 1, null, 'domestic', 'tuition', 100, 'course', 'Older unknown year'),
  (:live_fee, 2, 2030, 'domestic', 'tuition', 600, 'course', 'Previous year'),
  (:live_fee, 3, 2031, 'domestic', 'tuition', 900, 'course', 'Latest year'),
  (:live_fee, 4, 2032, 'domestic', 'tuition', null, 'course', 'Unreadable fee'),
  (:live_fee, 5, 2031, 'international', 'tuition', 200, 'unit', 'International');
select pg_temp.publish_snapshot(:live_fee);
select pg_temp.create_course_snapshot('PRJF1001', 2031::smallint) as draft_fee \gset
update public.course_version_details set college = 'Draft fee fixture college' where version_id = :draft_fee;
select pg_temp.create_course_snapshot('PRJF1002', 2031::smallint) as archived_fee \gset
update public.course_version_details set college = 'Archived fee fixture college' where version_id = :archived_fee;
select pg_temp.publish_snapshot(:archived_fee);
update public.catalogue_records set archived_at = now() where published_version_id = :archived_fee;
select pg_temp.create_course_snapshot('PRJF1000', 2031::smallint) as replacement_fee \gset
update public.course_version_details set college = 'Unpublished replacement fee' where version_id = :replacement_fee;

select pg_temp.create_structure_snapshot('programme', 'PRJ-PROG', 2031::smallint, 'Projection programme') as programme \gset
update public.structure_version_details set description = 'Full programme description' where version_id = :programme;
insert into public.academic_structure_snapshot_relationships(version_id, position, relationship_kind, target_kind, target_code, source_text, source_locator) values
  (:programme, 1, 'option', 'major', 'PRJ-MAJOR', 'Selectable major', '#1'),
  (:programme, 2, 'offered_in', 'minor', 'PRJ-REF', 'Incidental reference', '#2'),
  (:programme, 3, 'incompatible', 'specialisation', 'PRJ-INCOMP', 'Incompatibility', '#3');
insert into public.requirement_rules(version_id, academic_year_id, rule_kind, source_text)
select :programme, academic_year_id, 'structure', 'Selectable structure rules' from public.catalogue_versions where id = :programme
returning id as rule \gset
insert into public.requirement_groups(rule_id, version_id, group_key, operator) values (:rule, :programme, 'choices', 'all_of') returning id as rule_group \gset
insert into public.requirement_conditions(rule_id, version_id, group_id, condition_key, position, condition_kind, structure_kind, minimum_count)
values (:rule, :programme, :rule_group, 'minor-choice', 1, 'structure_set', 'minor', 1) returning id as rule_condition \gset
insert into public.requirement_condition_options(condition_id, version_id, position, kind, code)
values (:rule_condition, :programme, 1, 'minor', 'PRJ-MINOR');
select pg_temp.publish_snapshot(:programme);
select pg_temp.publish_structure('programme', 'PRJ-PROG', 2030::smallint, 'Earlier programme');
select pg_temp.publish_structure('major', 'PRJ-MAJOR', 2031::smallint, 'Projection major');
select pg_temp.publish_structure('minor', 'PRJ-MINOR', 2031::smallint, 'Projection minor');
select pg_temp.publish_structure('specialisation', 'PRJ-SPEC', 2031::smallint, 'Projection specialisation');
select pg_temp.create_structure_snapshot('programme', 'PRJ-DRAFT', 2031::smallint, 'Draft programme');
select pg_temp.publish_structure('programme', 'PRJ-ARCHIVED', 2031::smallint, 'Archived programme') as archived_programme \gset
update public.catalogue_records set archived_at = now() where published_version_id = :archived_programme;
set constraints all immediate;

select extensions.ok(has_function_privilege('anon', 'public.published_fee_reference_courses(integer)', 'execute') and has_function_privilege('authenticated', 'public.published_onboarding_catalogue()', 'execute'), 'public readers can execute the projections');
select extensions.ok((select bool_and(prosecdef and 'search_path=""' = any(proconfig)) from pg_proc where oid in ('public.published_fee_reference_courses(integer)'::regprocedure, 'public.published_onboarding_catalogue()'::regprocedure)), 'projection functions pin their definer search path');
set local role anon;
select extensions.is(jsonb_array_length(public.published_fee_reference_courses(2031)), 1, 'only live published fee references are returned');
select extensions.ok(public.published_fee_reference_courses(2031) @> '[{"college":"Fee fixture college","fees":[{"audience":"domestic","amount":900,"basis":"course"},{"audience":"international","amount":200,"basis":"unit"}]}]', 'latest non-null fee year wins independently for each audience');
select extensions.is(public.published_fee_reference_courses(2099), '[]'::jsonb, 'unpublished fee years return an empty list');
select extensions.ok(not public.published_fee_reference_courses(2031)::text like '%Unpublished replacement%', 'newer draft fee versions remain private');
select extensions.ok(public.published_onboarding_catalogue()->'degrees' @> '[{"code":"PRJ-PROG","catalogueYear":2031,"description":"Full programme description","durationYears":3,"units":144}]', 'programme choices retain description and numerical metadata');
select extensions.ok(public.published_onboarding_catalogue()->'degrees' @> '[{"code":"PRJ-PROG","catalogueYear":2030}]', 'all published programme years remain selectable');
select extensions.ok(public.published_onboarding_catalogue()->'catalogueYears' @> '[{"year":2030},{"year":2031}]', 'published programme years remain available');
select extensions.ok(public.published_onboarding_catalogue()->'degrees' @> '[{"code":"PRJ-PROG","catalogueYear":2031,"majorCodes":["PRJ-MAJOR"]}]', 'explicit relationship options become selectable');
select extensions.ok(public.published_onboarding_catalogue()->'degrees' @> '[{"code":"PRJ-PROG","catalogueYear":2031,"minorCodes":["PRJ-MINOR"]}]', 'structure-set options become selectable');
select extensions.ok(not public.published_onboarding_catalogue()::text like '%PRJ-REF%', 'incidental references are excluded');
select extensions.ok(not public.published_onboarding_catalogue()::text like '%PRJ-INCOMP%', 'incompatibilities are excluded');
select extensions.ok(public.published_onboarding_catalogue()->'majors' @> '[{"code":"PRJ-MAJOR"}]', 'published majors remain available');
select extensions.ok(public.published_onboarding_catalogue()->'minors' @> '[{"code":"PRJ-MINOR"}]', 'published minors remain available');
select extensions.ok(public.published_onboarding_catalogue()->'specialisations' @> '[{"code":"PRJ-SPEC"}]', 'published specialisations remain available');
select extensions.ok(not public.published_onboarding_catalogue()::text like '%PRJ-DRAFT%', 'draft structures remain private');
select extensions.ok(not public.published_onboarding_catalogue()::text like '%PRJ-ARCHIVED%', 'archived structures remain private');
reset role;
select * from extensions.finish();
rollback;
