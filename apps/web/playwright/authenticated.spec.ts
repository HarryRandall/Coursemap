import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect, login } from "./fixtures";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

test("sign-up allows optional onboarding and retains a session after reload", async ({
  page,
}) => {
  const email = `coursemap-signup-${randomUUID()}@example.test`;
  const password = `Local-${randomUUID()}!`;
  const env = localTestEnvironment();
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false } },
  );
  try {
    await page.goto("/signup");
    await page.locator('[name="email"]').fill(email);
    await page.locator('[name="password"]').fill(password);
    await page.locator('[name="passwordConfirmation"]').fill(password);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("link", { name: "Skip for now" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
  } finally {
    const { data, error } = await client.auth.admin.listUsers({
      perPage: 1000,
    });
    if (error) throw error;
    const user = data.users.find((user) => user.email === email);
    if (user) {
      const result = await client.auth.admin.deleteUser(user.id);
      if (result.error) throw result.error;
    }
  }
});

test("student navigation works at desktop and narrow widths", async ({
  page,
  student,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, student);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/dashboard",
      "/courses",
      "/key-dates",
      "/rooms",
      "/plan",
    ]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
    }
    await page.screenshot({
      path: test.info().outputPath(`student-${width}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("administrator can inspect course review tabs", async ({
  page,
  administrator,
}) => {
  await login(page, administrator);
  await page.goto("/admin/courses");
  await expect(page.getByRole("main")).toBeVisible();
  for (const path of [
    "/admin/programmes",
    "/admin/majors",
    "/admin/minors",
    "/admin/specialisations",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("searchbox", { name: "Search", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Academic year/ }),
    ).toBeVisible();
  }
  await page.goto("/admin/courses");
  await page
    .getByRole("link", { name: /COMP1100/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/courses\/[0-9a-f-]{36}$/);
  for (const name of ["History", "Preview", "Review"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }
});

test("course selection persists in an independent student plan", async ({
  page,
  planner,
}) => {
  await login(page, planner);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Add an unscheduled course" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add an unscheduled course" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Add an unscheduled course" }).click();
  await dialog
    .getByPlaceholder("Search by course code or name")
    .fill("COMP1100");
  await dialog.getByRole("option", { name: /COMP1100/ }).click();
  await dialog.getByRole("button", { name: /Add to/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("main")).toContainText("COMP1100");
  await page.goto("/courses/COMP1110?year=2026");
  await page.getByRole("tab", { name: "Requisites", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Requisites" }),
  ).toContainText(/prerequisite/i);
});
