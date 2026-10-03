import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { expect, login, test } from "./fixtures";

test("administrators browse year-first catalogue records", async ({
  page,
  administrator,
}) => {
  await login(page, administrator);

  await page.goto("/admin/programmes");
  await expect(page).toHaveURL(/\/admin\/programmes\/2026/);
  await expect(
    page.getByRole("heading", { name: "Programmes", level: 1, exact: true }),
  ).toBeAttached();

  // Local databases can hold hundreds of real listings, so find the fixture
  // rather than expecting it on the first page.
  await page
    .getByRole("main")
    .getByRole("searchbox", { name: "Search" })
    .fill("LOCAL-PROGRAMME");
  const programmeRow = page.getByRole("row", { name: /LOCAL-PROGRAMME/ });
  await expect(programmeRow).toBeVisible();
  await expect(
    programmeRow.getByText("Published", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Imports" })).toHaveCount(0);

  await page.route("**/api/admin/catalogue-directory", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'data: {"type":"started"}',
        'data: {"type":"complete","result":{"entryCount":1,"added":0}}',
        "",
      ].join("\n\n"),
    });
  });
  await page.getByRole("button", { name: "Refresh ANU listing" }).click();
  // The refresh reports itself in a progress toast, which settles on what the
  // listing actually returned rather than on a flat acknowledgement.
  await expect(page.getByText("2026 programmes refreshed")).toBeVisible();

  await page.goto("/admin/courses/2026?q=COMP1110");
  const courseRow = page.getByRole("row", { name: /COMP1110/ });
  await expect(courseRow).toBeVisible();
  await expect(courseRow.getByText("Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await courseRow.click();
  await expect(page).toHaveURL(/\/admin\/courses\/2026\/comp1110$/);
});

test("stopped bulk imports show imported counts and linked results on desktop and mobile", async ({
  page,
  administrator,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const runId = randomUUID();
  const syncIds = [randomUUID(), randomUUID()];
  let codeId: number | undefined;
  try {
    const [published] =
      await sql`select records.id, records.academic_year_id, records.published_version_id from public.catalogue_records records join public.catalogue_codes codes on codes.id = records.code_id join public.academic_years years on years.id = records.academic_year_id where codes.code = 'COMP1110' and years.year = 2026`;
    const [code] =
      await sql`insert into public.catalogue_codes (kind, code) values ('course', 'TSTB9901') returning id`;
    codeId = code.id;
    const [stopped] =
      await sql`insert into public.catalogue_records (code_id, kind, academic_year_id) values (${code.id}, 'course', ${published.academic_year_id}) returning id`;
    const [model] =
      await sql`select id from public.import_models where enabled order by id limit 1`;
    await sql`insert into public.catalogue_course_runs (id, academic_year, requested_by, requested_model, course_limit, budget_usd, input_usd_per_million, output_usd_per_million, state) values (${runId}, 2026, ${administrator.id}, ${model.id}, 2, 0.5, 0.1, 0.4, 'cancelled')`;
    for (const [index, record] of [published, stopped].entries()) {
      await sql`insert into public.catalogue_syncs (id, record_id, trigger, status, requested_model, parser_version, prompt_version, schema_version, source_version_id) values (${syncIds[index]}, ${record.id}, 'manual', ${index === 0 ? "unchanged" : "cancelled"}, ${model.id}, 'test', 'test', 'test', ${index === 0 ? published.published_version_id : null})`;
      await sql`insert into public.catalogue_course_run_items (run_id, record_id, sync_id, published_version_id, actual_usd) values (${runId}, ${record.id}, ${syncIds[index]}, ${index === 0 ? published.published_version_id : null}, ${index === 0 ? 0 : null})`;
    }
    await login(page, administrator);
    await page.goto(`/admin/operations/catalogue/imports/${runId}`);
    await expect(
      page.getByText("1 of 2 imported", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Courses imported" }),
    ).toHaveAttribute("aria-valuenow", "1");
    await page.getByRole("tab", { name: "Courses (2)", exact: true }).click();
    await expect(page).toHaveURL(/tab=courses/);
    await expect(page.getByRole("row", { name: /COMP1110/ })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("tab", { name: "Courses (2)", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(
      page.getByText("1 of 2 imported", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Courses imported" }),
    ).toBeVisible();
  } finally {
    await sql`delete from public.catalogue_course_run_items where run_id = ${runId}`;
    await sql`delete from public.catalogue_course_runs where id = ${runId}`;
    await sql`delete from public.catalogue_syncs where id = any(${sql.array(syncIds)}::uuid[])`;
    if (codeId)
      await sql`delete from public.catalogue_codes where id = ${codeId}`;
    await sql.end();
  }
});
