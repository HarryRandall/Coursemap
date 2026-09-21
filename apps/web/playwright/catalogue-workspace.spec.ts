import { expect, login, test } from "./fixtures";

test("catalogue records expose route-backed foundation tabs", async ({
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

  await page.getByRole("tab", { name: "Student view" }).click();
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
  await expect(page.getByRole("button", { name: /restore/i })).toHaveCount(0);
});
