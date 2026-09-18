import postgres from "postgres";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { expect, login, test } from "./fixtures";

/**
 * The record workspace: preview the published course, edit its title and a
 * learning outcome, save as a draft, publish, then restore the original from
 * history and discard that draft.
 */
test("administrators edit, preview, publish and restore a course snapshot", async ({
  page,
  administrator,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const [seed] = await sql`
    select item_years.id as item_year_id, item_years.published_snapshot_id, details.title
    from public.catalogue_item_years as item_years
    join public.catalogue_items as items on items.id = item_years.item_id
    join public.course_snapshot_details as details on details.snapshot_id = item_years.published_snapshot_id
    where items.code = 'COMP1100' and item_years.draft_snapshot_id is null
  `;
  expect(
    seed,
    "the local seed publishes COMP1100 without a draft",
  ).toBeTruthy();
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
      select draft_snapshot_id, published_snapshot_id from public.catalogue_item_years where id = ${seed.item_year_id}
    `;
    expect(afterEdit.draft_snapshot_id).not.toBeNull();
    expect(Number(afterEdit.published_snapshot_id)).toBe(
      Number(seed.published_snapshot_id),
    );
    const [outcomeCount] = await sql`
      select count(*)::int as count from public.course_learning_outcomes where snapshot_id = ${afterEdit.draft_snapshot_id}
    `;
    expect(outcomeCount.count).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Publish draft" }).click();
    await expect(
      page.getByText("Published. Students now see this version."),
    ).toBeVisible();

    await page.getByRole("tab", { name: "History" }).click();
    const originalRow = page
      .getByRole("listitem")
      .filter({
        has: page.getByText(`#${seed.published_snapshot_id}`, { exact: true }),
      });
    await originalRow.getByRole("button", { name: "Restore as draft" }).click();
    await expect(page.getByText(/is now the draft/)).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("heading", { level: 1 }),
    ).toContainText(seed.title);
    await expect(
      page.getByRole("banner").getByRole("heading", { level: 1 }),
    ).not.toContainText("(edited)");

    const draftRow = page
      .getByRole("listitem")
      .filter({ has: page.getByText("Draft", { exact: true }) })
      .first();
    await draftRow.getByRole("button", { name: "Discard" }).click();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByText("Draft discarded.")).toBeVisible();
    const [afterDiscard] = await sql`
      select draft_snapshot_id from public.catalogue_item_years where id = ${seed.item_year_id}
    `;
    expect(afterDiscard.draft_snapshot_id).toBeNull();
  } finally {
    await sql`
      update public.catalogue_item_years
      set draft_snapshot_id = null, published_snapshot_id = ${seed.published_snapshot_id}
      where id = ${seed.item_year_id}
    `;
    await sql.end();
  }
});
