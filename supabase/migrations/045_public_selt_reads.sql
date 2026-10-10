-- Published survey results have the same visibility for every reader.
-- Import diagnostics and attribution are not part of the public report.
-- Bypass catalogue RLS here: code visibility also includes unpublished placeholders.
create function private.has_published_course_record(p_code_id bigint) returns boolean
  language sql stable security definer
  set search_path = ''
  as $$
    select exists (
      select 1 from public.catalogue_records records
      where records.code_id = p_code_id
        and records.kind = 'course'
        and records.published_version_id is not null
        and records.archived_at is null
    );
  $$;
revoke all on function private.has_published_course_record(bigint) from public, anon, authenticated, service_role;
grant execute on function private.has_published_course_record(bigint) to anon, authenticated;

grant select (id, code_id, source_name, source_url, report_run_at, notes, published_at)
  on public.selt_reports to anon;
grant select on public.selt_surveys, public.selt_question_themes to anon;

create policy selt_reports_anon_published_read on public.selt_reports for select to anon
  using (published_at is not null and (select private.has_published_course_record(selt_reports.code_id)));
create policy selt_surveys_anon_published_read on public.selt_surveys for select to anon
  using (exists (select 1 from public.selt_reports r where r.id = report_id and r.published_at is not null));
create policy selt_question_themes_anon_published_read on public.selt_question_themes for select to anon
  using (exists (select 1 from public.selt_reports r where r.id = report_id and r.published_at is not null));

-- The separate admin policies still permit review before catalogue publication.
alter policy selt_reports_published_read on public.selt_reports to authenticated
  using (published_at is not null and (select private.has_published_course_record(selt_reports.code_id)));
