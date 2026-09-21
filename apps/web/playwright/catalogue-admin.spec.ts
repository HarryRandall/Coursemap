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
  await expect(page.getByText("ANU listing refreshed.")).toBeVisible();

  await page.goto("/admin/courses/2026?q=COMP1110");
  const courseRow = page.getByRole("row", { name: /COMP1110/ });
  await expect(courseRow).toBeVisible();
  await expect(courseRow.getByText("Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await courseRow.click();
  await expect(page).toHaveURL(/\/admin\/courses\/2026\/comp1110$/);
});
