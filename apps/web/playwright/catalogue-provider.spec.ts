import postgres from "postgres";
import { cleanCatalogueFixtures, expect, login, test } from "./fixtures";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

test("an administrator resumes held imports across inline batches", async ({
  page,
  administrator,
}, testInfo) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const [original] =
    await sql`select * from public.catalogue_provider_controls where provider = 'openrouter'`;
  const codeIds: number[] = [];
  const syncIds: string[] = [];
  try {
    const [year] =
      await sql`select id from public.academic_years where year = 2026`;
    for (const code of ["TSTP9920", "TSTP9921"]) {
      const [identity] =
        await sql`insert into public.catalogue_codes (kind, code) values ('course', ${code}) returning id`;
      codeIds.push(identity.id);
      const [record] =
        await sql`insert into public.catalogue_records (code_id, kind, academic_year_id) values (${identity.id}, 'course', ${year.id}) returning id`;
      // Obsolete versions stop before source fetching or any paid extraction.
      const [sync] =
        await sql`insert into public.catalogue_syncs (record_id, trigger, status, requested_model, parser_version, prompt_version, schema_version, attempt_count, retry_count, error_code, error_message) values (${record.id}, 'manual', 'paused', (select id from public.import_models where enabled order by id limit 1), 'test', 'test', 'test', 7, 5, 'OPENROUTER_HTTP_403', 'Key limit exceeded (total limit).') returning id`;
      syncIds.push(sync.id);
    }
    await sql`update public.catalogue_provider_controls set paused = true, revision = revision + 1, paused_at = now(), pause_reason = 'key_limit', error_message = 'Key limit exceeded (total limit).' where provider = 'openrouter'`;
    await login(page, administrator);
    await page.goto(`/admin/operations/catalogue/syncs/${syncIds[0]}`);
    await expect(
      page.getByRole("main").getByText(/This sync is paused/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry sync", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Resume in Activity" }),
    ).toBeVisible();
    await page.goto("/admin/operations/catalogue?q=TSTP992");
    await expect(
      page
        .getByRole("main")
        .getByText("Catalogue imports are paused", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByText("2 unfinished syncs are preserved.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("provider-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const resume = page.getByRole("button", {
      name: "Resume imports",
      exact: true,
    });
    await expect(resume).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("provider-mobile.png"),
      fullPage: true,
    });
    await resume.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("main")
        .getByText("Catalogue imports are paused", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Recover paused imports" }),
    ).toHaveCount(0);
    const jobs =
      await sql`select status, error_code, attempt_count, retry_count, dispatch_generation from public.catalogue_syncs where id in ${sql(syncIds)}`;
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job).toMatchObject({
        status: "failed",
        error_code: "SYNC_VERSION_UNSUPPORTED",
        attempt_count: 8,
        retry_count: 1,
        dispatch_generation: 1,
      });
    }
    const [control] =
      await sql`select paused, resumed_by from public.catalogue_provider_controls where provider = 'openrouter'`;
    expect(control).toMatchObject({
      paused: false,
      resumed_by: administrator.id,
    });
    const [extractions] =
      await sql`select count(*)::integer as count from public.catalogue_extractions where sync_id in ${sql(syncIds)}`;
    expect(extractions.count).toBe(0);
  } finally {
    if (codeIds.length)
      await cleanCatalogueFixtures(sql, async (tx) => {
        await tx`delete from public.catalogue_codes where id in ${tx(codeIds)}`;
      });
    await sql`update public.catalogue_provider_controls set ${sql(original, "paused", "revision", "paused_at", "pause_reason", "error_message", "source_sync_id", "resumed_at", "resumed_by")} where provider = 'openrouter'`;
    await sql.end();
  }
});
