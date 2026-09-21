begin;

-- Workspace support: administrators preview any immutable catalogue version
-- they may read.

-- The student-facing projection of a version for administrators. Only course
-- versions have a projection today.
create or replace function public.admin_catalogue_version_projection(p_version_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  version_kind text;
begin
  if not private.can_manage_catalogue() then
    raise exception using errcode = '42501', message = 'Catalogue permission is required.';
  end if;
  select kind into version_kind from public.catalogue_versions where id = p_version_id;
  if version_kind is null then
    raise exception using errcode = 'P0002', message = 'The catalogue version does not exist.';
  end if;
  if version_kind <> 'course' then
    return null;
  end if;
  return private.course_version_projection(p_version_id)
    || jsonb_build_object('versionId', p_version_id);
end;
$function$;

revoke all on function public.admin_catalogue_version_projection(bigint) from public, anon;
grant execute on function public.admin_catalogue_version_projection(bigint) to authenticated;

commit;
