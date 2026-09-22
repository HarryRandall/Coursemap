import { expect, login, test } from "./fixtures";

test("the changes route reports local unpublished state without source review", async ({
  page,
  administrator,
}) => {
  await login(page, administrator);
  await page.goto("/admin/courses/2026/comp1110/changes");

  await expect(page).toHaveURL(/\/admin\/courses\/2026\/comp1110\/changes$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "COMP1110",
  );
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
