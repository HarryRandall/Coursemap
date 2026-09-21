import postgres from "postgres";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { expect, login, test } from "./fixtures";

/**
 * The record workspace: preview the published course, edit its title and a
 * learning outcome, save a new version, publish, then restore the original
 * content through another immutable version.
 */
test("administrators edit, preview, publish and restore a course version", async ({
  page,
  administrator,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const [seed] = await sql`
    select item_years.id as record_id, item_years.published_version_id, details.title
    from public.catalogue_records as item_years
    join public.catalogue_codes as items on items.id = item_years.code_id
    join public.course_version_details as details on details.version_id = item_years.published_version_id
    where items.code = 'COMP1100'
  `;
  expect(seed, "the local seed publishes COMP1100").toBeTruthy();
  try {
    await login(page, administrator);
    await page.goto("/admin/courses/COMP1100?year=2026&tab=preview");
    await expect(
      page.getByRole("banner").getByRole("heading", { level: 1 }),
    ).toContainText(seed.title);
    await expect(page.getByRole("tab", { name: "Preview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The student view renders inside the admin preview.
    await expect(page.getByRole("tab", { name: /Overview/ })).toBeVisible();

    await page.getByRole("tab", { name: "Edit" }).click();
    const title = page.getByLabel("Title", { exact: true });
    await expect(title).toHaveValue(seed.title);
    await title.fill(`${seed.title} (edited)`);
    await page.getByRole("button", { name: /Learning outcomes/ }).click();
    await page.getByRole("button", { name: "Add item" }).first().click();
    const outcomes = page.locator(
      "[id^='course-learningOutcomes-'][id$='-body']",
    );
    await outcomes.last().fill("Explain a manually added learning outcome.");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(page.getByText("Saved as the new draft.")).toBeVisible();

    await expect(
      page.getByRole("banner").getByRole("heading", { level: 1 }),
    ).toContainText(`${seed.title} (edited)`);
    const [afterEdit] = await sql`
      select item_years.published_version_id,
        (select versions.id from public.catalogue_versions as versions
         where versions.record_id = item_years.id
         order by versions.created_at desc, versions.id desc limit 1) as current_version_id
      from public.catalogue_records as item_years where item_years.id = ${seed.record_id}
    `;
    expect(afterEdit.current_version_id).not.toBeNull();
    expect(Number(afterEdit.published_version_id)).toBe(
      Number(seed.published_version_id),
    );
    const [outcomeCount] = await sql`
      select count(*)::int as count from public.course_learning_outcomes where version_id = ${afterEdit.current_version_id}
    `;
    expect(outcomeCount.count).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Publish draft" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Publish", exact: true })
      .click();
    await expect(
      page.getByText("Published. Students now see this version."),
    ).toBeVisible();

    await page.getByRole("tab", { name: "History" }).click();
    const originalRow = page.getByRole("listitem").filter({
      has: page.getByRole("heading", {
        name: `Imported as #${seed.published_version_id}`,
      }),
    });
    await originalRow.getByRole("button", { name: "Restore as draft" }).click();
    await expect(page.getByText(/is now the draft/)).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("heading", { level: 1 }),
    ).toContainText(seed.title);
    await expect(
      page.getByRole("banner").getByRole("heading", { level: 1 }),
    ).not.toContainText("(edited)");
  } finally {
    await sql`
      update public.catalogue_records
      set published_version_id = ${seed.published_version_id}
      where id = ${seed.record_id}
    `;
    await sql.end();
  }
});
