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
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Unpublish", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Discard draft" }).click();
  const discardDialog = page.getByRole("dialog", {
    name: "Discard this draft?",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Discard draft" }).click();
  await expect(page).toHaveURL(
    /\/admin\/courses\/2026\/comp1100\/student-view$/,
  );

  await expect(page.getByRole("tab", { name: "Student view" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("tab", { name: "Changelog" }).click();
  await expect(page).toHaveURL(/\/admin\/courses\/2026\/comp1100\/changelog$/);
  await expect(page.getByRole("list", { name: "Changelog" })).toBeVisible();
  await expect(page.getByText(/Version \d+ created/).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Draft discarded" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /restore/i })).toHaveCount(0);
});
