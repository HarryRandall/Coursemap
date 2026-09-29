import postgres from "postgres";
import { expect, login, test } from "./fixtures";
import { CATALOGUE_CONTENT_SCHEMA_VERSION } from "../lib/catalogue/content";
import { contentHashForCatalogueContent } from "../lib/catalogue-import/version-content";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

import { emptyCourseExtraction } from "../lib/catalogue-import/kinds/course/finalise";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project";
import { courseCatalogueContent } from "../lib/catalogue/content";

test("subject course counts survive editor saves and student previews", async ({
  page,
  administrator,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const code = "TSTN9903";
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
    await sql`insert into public.catalogue_listings (academic_year_id, kind, code, title, code_id, record_id, is_current) values (${year.id}, 'course', ${code}, 'Subject count browser fixture', ${identity.id}, ${record.id}, true)`;
    const model = emptyCourseExtraction({
      code,
      year: 2026,
      title: "Subject count browser fixture",
    });
    model.requisites.prerequisiteText =
      "You must have completed a STAT course.";
    model.requisites.prerequisiteRule = {
      op: "min_courses_from_subject",
      subjectCode: "STAT",
      minimumCount: 1,
    };
    const content = courseCatalogueContent({
      projection: projectCourseSnapshot(model),
    });
    content.contentHash = contentHashForCatalogueContent(content);
    await sql`insert into public.catalogue_drafts (record_id, content, content_hash, content_schema_version) values (${record.id}, ${sql.json(content)}, ${content.contentHash}, ${CATALOGUE_CONTENT_SCHEMA_VERSION})`;
    await login(page, administrator);
    await page.goto(`/admin/courses/2026/${code.toLowerCase()}/student-view`);
    await page.getByRole("tab", { name: "Requisites", exact: true }).click();
    await expect(
      page.getByRole("link", { name: /Complete 1 STAT course/u }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("link", { name: /Complete 1 STAT course/u }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("tab", { name: "Content", exact: true }).click();
    await page.getByRole("button", { name: /Prerequisites/u }).click();
    await expect(
      page.getByRole("spinbutton", { name: "Course count", exact: true }),
    ).toHaveValue("1");
    await page
      .getByRole("spinbutton", { name: "Course count", exact: true })
      .fill("2");
    await expect
      .poll(async () => {
        const [draft] =
          await sql`select content from public.catalogue_drafts where record_id = ${record.id}`;
        return draft.content.requirements.conditions.find(
          (condition: { kind: string }) => condition.kind === "subject_courses",
        );
      })
      .toMatchObject({
        minimumCount: 2,
        minimumUnits: null,
        maximumUnits: null,
        subjectCode: "STAT",
      });
    await page.getByRole("tab", { name: "Student view", exact: true }).click();
    await page.getByRole("tab", { name: "Requisites", exact: true }).click();
    await expect(
      page.getByRole("link", { name: /Complete 2 STAT courses/u }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("link", { name: /Complete 2 STAT courses/u }),
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
