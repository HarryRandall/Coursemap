import { expect, login, test } from "./fixtures";

test("catalogue content autosaves and remains separate from student view", async ({
  page,
  administrator,
}) => {
  await login(page, administrator);
  await page.goto("/admin/courses/2026/COMP1100");
  await expect(page).toHaveURL(/\/admin\/courses\/2026\/comp1100$/);

  await expect(
    page.getByRole("heading", { name: "COMP1100", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Content" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0);
  // A record opens as what it says rather than as a form, so the editor and
  // the draft behind it both start with Edit in the record actions menu.
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  const recordActions = page.getByRole("button", { name: "Record actions" });
  await recordActions.click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  const description = page.getByLabel("Description");
  const originalDescription = await description.inputValue();
  await description.fill(`${originalDescription}\n\nAutosave browser check.`);
  await page.waitForTimeout(1_500);
  await expect(page.getByRole("status")).toContainText("Saved", {
    timeout: 10_000,
  });
  await page.reload();
  await expect(page.getByText("Published · Unpublished changes")).toBeVisible();
  await expect(page.getByLabel("Description")).toHaveValue(
    `${originalDescription}\n\nAutosave browser check.`,
  );
  await recordActions.click();
  await expect(
    page.getByRole("menuitem", { name: "Publish", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("menuitem", { name: "Unpublish", exact: true }),
  ).toBeVisible();

  await page.getByRole("menuitem", { name: "Discard draft" }).click();
  const discardDialog = page.getByRole("dialog", {
    name: "Discard this draft?",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Discard draft" }).click();
  // Discarding leaves the editor rather than the record: the reader is put
  // back on the content they were editing, as the published version again.
  await expect(page).toHaveURL(/\/admin\/courses\/2026\/comp1100$/);
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await recordActions.click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Changelog" }).click();
  await expect(page).toHaveURL(/\/admin\/courses\/2026\/comp1100\/changelog$/);
  await expect(page.getByRole("list", { name: "Changelog" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Draft discarded" }).first(),
  ).toBeVisible();
  // The discarded draft was kept as a version, which the entry offers to open.
  const checkpoint = page
    .getByRole("link", { name: /View version \d+/ })
    .first();
  await expect(checkpoint).toBeVisible();
  await checkpoint.click();
  await expect(page).toHaveURL(
    /\/admin\/courses\/2026\/comp1100\/changelog\/\d+$/,
  );
  await expect(
    page.getByRole("button", { name: "Restore as draft" }),
  ).toBeVisible();
});
