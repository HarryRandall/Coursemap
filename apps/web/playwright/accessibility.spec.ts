import AxeBuilder from "@axe-core/playwright";
import { assertNoSeriousAccessibilityViolations } from "./accessibility-violations";
import { expect, login, test } from "./fixtures";

test("room search has no serious or critical accessibility violations", async ({
  page,
  administrator,
  indoorMap,
}) => {
  await login(page, administrator);
  await page.goto(`/rooms?room=${indoorMap.roomId}`);
  await expect(
    page.getByRole("group", { name: "Building floors", exact: true }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  assertNoSeriousAccessibilityViolations(results.violations);
});

test("the student dashboard has no serious or critical accessibility violations", async ({
  page,
  planner,
}) => {
  await login(page, planner);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("main")).toContainText("units completed");
  await expect(page.locator("body")).not.toContainText("Application error");
  const results = await new AxeBuilder({ page }).analyze();
  assertNoSeriousAccessibilityViolations(results.violations);
});
