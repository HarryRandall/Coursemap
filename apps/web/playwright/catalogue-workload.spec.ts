import postgres from "postgres";
import { expect, login, test } from "./fixtures";
import {
  CATALOGUE_CONTENT_SCHEMA_VERSION,
  emptyCatalogueContent,
} from "../lib/catalogue/content";
import { contentHashForCatalogueContent } from "../lib/catalogue-import/version-content";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

test("workload basis survives editing and qualifies student-facing hours", async ({
  page,
  administrator,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const code = "TSTW9902";
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
    await sql`insert into public.catalogue_listings (academic_year_id, kind, code, title, code_id, record_id, is_current) values (${year.id}, 'course', ${code}, 'Workload browser fixture', ${identity.id}, ${record.id}, true)`;
    const content = emptyCatalogueContent({
      kind: "course",
      code,
      academicYear: 2026,
      title: "Workload browser fixture",
    });
    content.course!.details.workloadText = "Source workload statement.";
    content.course!.details.workloadHours = 10;
    content.course!.details.workloadHoursBasis = "weekly";
    content.contentHash = contentHashForCatalogueContent(content);
    await sql`insert into public.catalogue_drafts (record_id, content, content_hash, content_schema_version) values (${record.id}, ${sql.json(content)}, ${content.contentHash}, ${CATALOGUE_CONTENT_SCHEMA_VERSION})`;

    await login(page, administrator);
    await page.goto(`/admin/courses/2026/${code.toLowerCase()}/student-view`);
    await expect(
      page.getByText("Source workload statement. (10 hours per week)", {
        exact: true,
      }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByText("Source workload statement. (10 hours per week)", {
        exact: true,
      }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const [label, basis, expected] of [
      [
        "Whole course",
        "total",
        "Source workload statement. (10 hours in total)",
      ],
      ["Not stated", null, "Source workload statement."],
    ] as const) {
      await page.getByRole("tab", { name: "Content", exact: true }).click();
      await page
        .getByRole("combobox", { name: "Workload hours basis" })
        .click();
      await page.getByRole("option", { name: label, exact: true }).click();
      await expect
        .poll(async () => {
          const [draft] =
            await sql`select content from public.catalogue_drafts where record_id = ${record.id}`;
          return draft.content.course.details.workloadHoursBasis;
        })
        .toBe(basis);
      await page
        .getByRole("tab", { name: "Student view", exact: true })
        .click();
      await expect(page.getByText(expected, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/\(10 hours\)/)).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.goto("/admin/courses");
  } finally {
    await sql`delete from public.catalogue_listings where code = ${code}`;
    if (codeId !== undefined)
      await sql`delete from public.catalogue_codes where id = ${codeId}`;
    await sql.end();
  }
});
