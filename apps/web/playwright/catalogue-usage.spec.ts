import postgres from "postgres";
import { cleanCatalogueFixtures, expect, login, test } from "./fixtures";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

test("operations distinguishes unknown usage, partial totals and cached zero", async ({
  page,
  administrator,
}, testInfo) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const code = "TSTU9905";
  let codeId: number | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const [year] =
      await sql`select id from public.academic_years where year = 2026`;
    const [identity] =
      await sql`insert into public.catalogue_codes (kind, code) values ('course', ${code}) returning id`;
    codeId = identity.id;
    const [record] =
      await sql`insert into public.catalogue_records (code_id, kind, academic_year_id) values (${identity.id}, 'course', ${year.id}) returning id`;
    const [sync] =
      await sql`insert into public.catalogue_syncs (record_id, trigger, status, requested_model, parser_version, prompt_version, schema_version) values (${record.id}, 'manual', 'failed', (select id from public.import_models where enabled order by id limit 1), 'test', 'test', 'test') returning id, requested_model`;
    const [stage] =
      await sql`insert into public.catalogue_sync_stages (sync_id, stage_name, attempt_number, status) values (${sync.id}, 'model_extract', 1, 'failed') returning id`;
    const [artifact] =
      await sql`insert into public.catalogue_sync_artifacts (sync_id, stage_id, kind, attempt_number, media_type, content_sha256, byte_size, storage_bucket, storage_path) values (${sync.id}, ${stage.id}, 'model_request', 1, 'application/json', ${"a".repeat(64)}, 2, 'course-import-artifacts', 'test-only/usage.json') returning id`;
    let paidExtractionId: string | undefined;
    for (const [index, cost, source, tokens] of [
      [1, 0.03, "provider", 12],
      [2, null, "unknown", null],
      [3, 0, "cache", 0],
      [4, 0, "provider", 0],
    ] as const) {
      const [inserted] =
        await sql`insert into public.catalogue_extractions (sync_id, extraction_number, requested_model, fingerprint, prompt_version, schema_version, request_artifact_id, input_tokens, output_tokens, cost_usd, cost_source, reused_from_extraction_id) values (${sync.id}, ${index}, ${sync.requested_model}, ${String(index).repeat(64)}, 'test', 'test', ${artifact.id}, ${tokens}, ${tokens}, ${cost}, ${source}, ${source === "cache" ? paidExtractionId! : null}) returning id`;
      if (index === 1) paidExtractionId = inserted.id;
    }
    await login(page, administrator);
    await page.goto(`/admin/operations/catalogue?q=${code}`);
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: code, exact: true }) });
    await expect(
      row.getByText("At least US$0.03", { exact: true }),
    ).toBeVisible();
    await row.getByRole("link", { name: code, exact: true }).click();
    await page.getByRole("tab", { name: /Stages/ }).click();
    await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(3);
    await expect(
      page.getByText("US$0.00 (cached)", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("US$0.00", { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("usage-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByText("US$0.00 (cached)", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText("US$0.00 (cached)", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("usage-mobile.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    if (codeId !== undefined)
      await cleanCatalogueFixtures(sql, async (tx) => {
        if (codeId !== undefined)
          await tx`delete from public.catalogue_codes where id = ${codeId}`;
      });
    await sql.end();
  }
});
