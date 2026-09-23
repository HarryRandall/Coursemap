-- The model's review notes on a source version are for the people who review
-- catalogue changes. No end-user role writes them, anonymous readers never
-- see them, and they are sealed with the version they describe.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

select extensions.has_table(
  'public', 'catalogue_version_flags', 'model review notes are stored'
);

select extensions.ok(
  (
    select relrowsecurity from pg_class
    where oid = 'public.catalogue_version_flags'::regclass
  ),
  'row level security is enabled on model review notes'
);

select extensions.ok(
  not has_table_privilege(
    'authenticated', 'public.catalogue_version_flags', 'insert, update, delete'
  ),
  'authenticated clients cannot write model review notes'
);

select extensions.ok(
  has_table_privilege('authenticated', 'public.catalogue_version_flags', 'select'),
  'authenticated clients may read notes their policy allows'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.catalogue_version_flags', 'select'),
  'anonymous readers cannot see model review notes'
);

select extensions.is(
  (
    select array_agg(policyname::text order by policyname)
    from pg_policies
    where schemaname = 'public' and tablename = 'catalogue_version_flags'
  ),
  array['catalogue_version_flags_read'],
  'the only policy is the catalogue reviewers read policy'
);

select extensions.ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.catalogue_version_flags'::regclass
      and tgname = 'catalogue_version_flags_guard_sealed'
  ),
  'notes are sealed with their version'
);

select extensions.ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.catalogue_version_flags'::regclass
      and conname = 'catalogue_version_flags_severity_check'
  ),
  'a note is either a warning or an error'
);

select * from extensions.finish();

rollback;
