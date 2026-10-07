-- Drafts remain restricted to import administrators. Signed-in readers see only publications.
create policy selt_reports_published_read on public.selt_reports for select to authenticated
  using (published_at is not null);
create policy selt_surveys_published_read on public.selt_surveys for select to authenticated
  using (exists (select 1 from public.selt_reports r where r.id = report_id and r.published_at is not null));
create policy selt_question_themes_published_read on public.selt_question_themes for select to authenticated
  using (exists (select 1 from public.selt_reports r where r.id = report_id and r.published_at is not null));
