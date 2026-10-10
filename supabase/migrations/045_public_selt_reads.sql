-- Published survey results have the same visibility for every reader.
-- Import diagnostics and attribution are not part of the public report.
grant select (id, code_id, source_name, source_url, report_run_at, notes, published_at)
  on public.selt_reports to anon;
grant select on public.selt_surveys, public.selt_question_themes to anon;

create policy selt_reports_anon_published_read on public.selt_reports for select to anon
  using (published_at is not null);
create policy selt_surveys_anon_published_read on public.selt_surveys for select to anon
  using (exists (select 1 from public.selt_reports r where r.id = report_id and r.published_at is not null));
create policy selt_question_themes_anon_published_read on public.selt_question_themes for select to anon
  using (exists (select 1 from public.selt_reports r where r.id = report_id and r.published_at is not null));
