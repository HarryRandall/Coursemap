import {
  emptyGuestState,
  encodeGuestPlan,
  guestPlanChunkName,
} from "../lib/coursemap/guest-plan";
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
    await page.getByRole("main").locator('[name="email"]').fill(email);
    await page.getByRole("main").locator('[name="password"]').fill(password);
    await page
      .getByRole("main")
      .locator('[name="passwordConfirmation"]')
      .fill(password);
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

test("course selection persists in an independent student plan", async ({
  page,
  planner,
}) => {
  await login(page, planner);
  await page.goto("/plan");
  await page
    .getByRole("button", {
      name: "Add a course to Semester 1 2026",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Add a course to Semester 1 2026",
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole("button", {
      name: "Add a course to Semester 1 2026",
      exact: true,
    })
    .click();
  await dialog.getByPlaceholder(/courses by code or name/).fill("COMP1100");
  await dialog.getByRole("option", { name: /COMP1100/ }).click();
  await dialog.getByRole("button", { name: /Add to/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("main")).toContainText("COMP1100");
  await page.goto("/courses/2026/comp1110");
  await page.getByRole("tab", { name: "Requisites", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Requisites" }),
  ).toContainText(/prerequisite/i);
});

test("guest planning persists on reload and transfers after sign-in", async ({
  page,
  student,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as a guest" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  const guest = emptyGuestState(2026);
  guest.profile = {
    ...guest.profile,
    name: "Guest student",
    degreeCode: "LOCAL-PROGRAMME",
  };
  guest.attempts = [
    {
      id: "guest-comp1100",
      courseCode: "COMP1100",
      termId: "2026-s1",
      academicYear: 2026,
      status: "planned",
    },
  ];
  const chunks = encodeGuestPlan(guest)!;
  await page.context().addCookies(
    chunks.map((value, index) => ({
      name: guestPlanChunkName(index),
      value,
      url: "http://127.0.0.1:4319",
    })),
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/plan");
    await expect(page.getByRole("main")).toContainText("COMP1100");
    await page.goto("/profile");
    if (width === 1440) {
      await page
        .getByRole("textbox", { name: "Preferred name", exact: true })
        .fill("Ada");
      await page
        .getByRole("textbox", { name: "Pronouns", exact: true })
        .fill("she/her");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
    }
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Preferred name", exact: true }),
    ).toHaveValue("Ada");
    await page.getByRole("tab", { name: "Account", exact: true }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data" }).click();
    expect((await downloaded).suggestedFilename()).toMatch(
      /^coursemap-plan-.*\.json$/,
    );
    await page.screenshot({
      path: test.info().outputPath(`guest-profile-${width}.png`),
      fullPage: true,
    });
  }
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await login(page, student);
  await expect
    .poll(async () =>
      (await page.context().cookies()).some(
        (cookie) => cookie.name === "coursemap-guest",
      ),
    )
    .toBe(false);
  await page.goto("/plan");
  await expect(page.getByRole("main")).toContainText("COMP1100");
  await page.goto("/profile");
  await expect(
    page.getByRole("textbox", { name: "Preferred name", exact: true }),
  ).toHaveValue("Ada");
});

for (const replace of [false, true]) {
  test(`existing accounts ${replace ? "replace" : "keep"} their plan only after choosing`, async ({
    page,
    planner,
  }) => {
    const guest = emptyGuestState(2026);
    guest.profile = {
      ...guest.profile,
      name: "Guest student",
      degreeCode: "LOCAL-PROGRAMME",
    };
    guest.attempts = [
      {
        id: "guest-course",
        courseCode: "COMP1100",
        termId: "2026-s1",
        academicYear: 2026,
        status: "planned",
      },
    ];
    await page.context().addCookies(
      encodeGuestPlan(guest)!.map((value, index) => ({
        name: guestPlanChunkName(index),
        value,
        url: "http://127.0.0.1:4319",
      })),
    );
    await login(page, planner);
    const prompt = page.getByRole("dialog", {
      name: "Use the plan you made as a guest?",
    });
    await expect(prompt).toBeVisible();
    await prompt
      .getByRole("button", {
        name: replace ? "Use guest plan" : "Keep account plan",
        exact: true,
      })
      .click();
    await expect(prompt).not.toBeVisible();
    await expect
      .poll(async () =>
        (await page.context().cookies()).some(
          (cookie) => cookie.name === "coursemap-guest",
        ),
      )
      .toBe(false);
    await page.goto("/plan");
    const board = page.getByRole("region", {
      name: "Course plan",
      exact: true,
    });
    if (replace) await expect(board).toContainText("COMP1100");
    else await expect(board).not.toContainText("COMP1100");
  });
}
