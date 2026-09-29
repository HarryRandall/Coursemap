import postgres from "postgres";
import { expect, login, test } from "./fixtures";
import { CATALOGUE_CONTENT_SCHEMA_VERSION } from "../lib/catalogue/content";
import { contentHashForCatalogueContent } from "../lib/catalogue-import/version-content";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

import { emptyCourseExtraction } from "../lib/catalogue-import/kinds/course/finalise";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project";
import { courseCatalogueContent } from "../lib/catalogue/content";

test("concurrent exclusions retain timing and advisory scope through editor saves", async ({
  page,
  administrator,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const code = "TSTE9904";
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
    await sql`insert into public.catalogue_listings (academic_year_id, kind, code, title, code_id, record_id, is_current) values (${year.id}, 'course', ${code}, 'Concurrent exclusion browser fixture', ${identity.id}, ${record.id}, true)`;
    const model = emptyCourseExtraction({
      code,
      year: 2026,
      title: "Concurrent exclusion browser fixture",
    });
    model.requisites.incompatibilityText =
      "Cannot concurrently enrol in COMP1100. Avoid concurrently taking MATH1005.";
    model.requisites.concurrentIncompatibilityCourseCodes = ["COMP1100"];
    model.requisites.softConcurrentIncompatibilityCourseCodes = ["MATH1005"];
    const content = courseCatalogueContent({
      projection: projectCourseSnapshot(model),
    });
    content.contentHash = contentHashForCatalogueContent(content);
    await sql`insert into public.catalogue_drafts (record_id, content, content_hash, content_schema_version) values (${record.id}, ${sql.json(content)}, ${content.contentHash}, ${CATALOGUE_CONTENT_SCHEMA_VERSION})`;
    await login(page, administrator);
    await page.goto(`/admin/courses/2026/${code.toLowerCase()}/student-view`);
    await page.getByRole("tab", { name: "Requisites", exact: true }).click();
    await expect(
      page.getByText("You can't take this in the same semester as COMP1100", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Check recommended course combinations", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByText("You can't take this in the same semester as COMP1100", {
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("concurrent-exclusion-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("tab", { name: "Content", exact: true }).click();
    await page.getByRole("button", { name: /Incompatibilit/u }).click();
    const match = page
      .getByRole("button", { name: "Course requirement", exact: true })
      .first();
    await expect(match).toContainText("Must not be concurrent");
    await match.click();
    await page
      .getByRole("button", { name: "Must not be completed", exact: true })
      .click();
    await expect
      .poll(async () => {
        const [draft] =
          await sql`select content from public.catalogue_drafts where record_id = ${record.id}`;
        return draft.content.requirements.conditions.find(
          (condition: { itemCode: string }) =>
            condition.itemCode === "COMP1100",
        ).kind;
      })
      .toBe("incompatible");
    const [draft] =
      await sql`select content from public.catalogue_drafts where record_id = ${record.id}`;
    expect(
      draft.content.requirements.conditions.find(
        (condition: { itemCode: string }) => condition.itemCode === "MATH1005",
      ),
    ).toMatchObject({
      kind: "incompatible_concurrent",
      hardness: "advisory",
      sourceText: model.requisites.incompatibilityText,
    });
    await page.getByRole("tab", { name: "Student view", exact: true }).click();
    await page.getByRole("tab", { name: "Requisites", exact: true }).click();
    await expect(
      page.getByText("You can't take this if you've completed COMP1100", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Check recommended course combinations", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await page.goto("/admin/courses");
  } finally {
    await sql`delete from public.catalogue_listings where code = ${code}`;
    if (codeId !== undefined)
      await sql`delete from public.catalogue_codes where id = ${codeId}`;
    await sql.end();
  }
});
