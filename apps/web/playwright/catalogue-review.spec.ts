import postgres from "postgres";
import { cleanCatalogueFixtures, expect, login, test } from "./fixtures";
import {
  CATALOGUE_CONTENT_SCHEMA_VERSION,
  emptyCatalogueContent,
} from "../lib/catalogue/content";
import { contentHashForCatalogueContent } from "../lib/catalogue-import/version-content";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

test("the changes route reports local unpublished state without source review", async ({
  page,
  administrator,
}) => {
  await login(page, administrator);
  await page.goto("/admin/courses/2026/comp1110/changes");

  await expect(page).toHaveURL(/\/admin\/courses\/2026\/comp1110\/changes$/);
  // The record summary sits on the Content tab only, so the breadcrumb names
  // the record here.
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("COMP1110");
  await expect(page.getByRole("tab", { name: "Changes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // The fixture record was published without ever being checked against ANU,
  // so the tab says that rather than implying a comparison happened.
  await expect(
    page.getByRole("heading", { name: "No ANU changes yet" }),
  ).toBeVisible();
  await expect(
    page.getByText("This course hasn't been synced from ANU."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conflicts" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Incoming from ANU" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /apply/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /accept/i })).toHaveCount(0);
});

test("a failed ANU reading cannot claim a match or publish its incomplete draft", async ({
  page,
  administrator,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const code = "TSTX9901";
  let codeId: number | undefined;
  try {
    const [year] =
      await sql`select id from public.academic_years where year = 2026`;
    const [identity] =
      await sql`insert into public.catalogue_codes (kind, code) values ('course', ${code}) returning id`;
    codeId = identity.id;
    const [record] =
      await sql`insert into public.catalogue_records (code_id, kind, academic_year_id) values (${identity.id}, 'course', ${year.id}) returning id`;
    await sql`insert into public.catalogue_listings (academic_year_id, kind, code, title, code_id, record_id, is_current) values (${year.id}, 'course', ${code}, 'Incomplete browser reading', ${identity.id}, ${record.id}, true)`;
    const content = emptyCatalogueContent({
      kind: "course",
      code,
      academicYear: 2026,
      title: "Incomplete browser reading",
    });
    content.course!.details.description =
      "A field salvaged from an incomplete response.";
    content.flags = [
      {
        fieldPath: "modelExtraction",
        severity: "error",
        code: "INVALID",
        message: "The model did not return a complete response.",
        sourceExcerpt: null,
      },
    ];
    content.contentHash = contentHashForCatalogueContent(content);
    await sql`insert into public.catalogue_drafts (record_id, content, content_hash, content_schema_version) values (${record.id}, ${sql.json(content)}, ${content.contentHash}, ${CATALOGUE_CONTENT_SCHEMA_VERSION})`;
    await sql`insert into public.catalogue_syncs (record_id, trigger, status, requested_model, parser_version, prompt_version, schema_version, error_code, error_message) values (${record.id}, 'manual', 'failed', (select id from public.import_models where enabled order by id limit 1), 'test', 'test', 'test', 'MODEL_EXTRACTION_INVALID', 'The model response was incomplete.')`;

    await login(page, administrator);
    await page.goto(`/admin/courses/2026/${code.toLowerCase()}/changes`);
    await expect(
      page.getByRole("heading", { name: "The latest ANU sync failed" }),
    ).toBeVisible();
    await expect(
      page.getByText(/matches the latest ANU information/),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: "The latest ANU sync failed" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Content", exact: true }).click();
    await page.getByRole("button", { name: "Record actions" }).click();
    await page.getByRole("menuitem", { name: "Publish", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Publish these changes?" })
      .getByRole("button", { name: "Publish", exact: true })
      .click();
    await expect(
      page.getByText(
        "The draft contains extraction errors. Resolve them with a complete ANU reading before publishing.",
      ),
    ).toBeVisible();
    const [unchanged] =
      await sql`select published_version_id from public.catalogue_records where id = ${record.id}`;
    expect(unchanged.published_version_id).toBeNull();
  } finally {
    await sql`delete from public.catalogue_listings where code = ${code}`;
    if (codeId !== undefined)
      await cleanCatalogueFixtures(sql, async (tx) => {
        if (codeId !== undefined)
          await tx`delete from public.catalogue_codes where id = ${codeId}`;
      });
    await sql.end();
  }
});
