import assert from "node:assert/strict";
import postgres from "postgres";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { stubRoomMapRequests } from "./room-map-stubs";
import { expectRoundedCorners } from "./rounded-corners";
import { test, expect, login } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await stubRoomMapRequests(page);
});

test("students save and clear explicit enrolment mode across desktop and mobile", async ({
  page,
  planner,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  try {
    await login(page, planner);
    await page.goto("/profile");
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Enrolment browser student");
    await page
      .getByRole("tab", { name: "Course of study", exact: true })
      .click();
    const mode = page.getByRole("radiogroup", {
      name: "Enrolment mode",
      exact: true,
    });
    await expect(
      mode.getByRole("radio", { name: "Not specified", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await mode
      .getByRole("radio", { name: "Flexible Double Degree", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect
      .poll(async () => {
        const [plan] =
          await sql`select enrolment_mode from public.plans where owner_id = ${planner.id}::uuid and is_primary`;
        return plan.enrolment_mode;
      })
      .toBe("flexible_double_degree");
    await page.reload();
    await expect(
      mode.getByRole("radio", { name: "Flexible Double Degree", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(mode).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath("enrolment-mode-mobile.png"),
      fullPage: true,
    });
    await mode
      .getByRole("radio", { name: "Not specified", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect
      .poll(async () => {
        const [plan] =
          await sql`select enrolment_mode from public.plans where owner_id = ${planner.id}::uuid and is_primary`;
        return plan.enrolment_mode;
      })
      .toBe(null);
    await page.reload();
    await expect(
      mode.getByRole("radio", { name: "Not specified", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
  } finally {
    await sql.end();
  }
});

test("public pages render catalogue data and safe authentication forms", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("main")).toContainText(
    "Plan your degree, semester by semester.",
  );
  await page.goto("/courses?q=COMP1100&year=2026");
  await expect(page.getByRole("main")).toContainText("COMP1100");
  await page.goto("/login?next=%2F%2Fevil.example%2Fplan");
  await expect(
    page.getByRole("main").locator('input[name="next"]'),
  ).toHaveValue("/dashboard");
  await expect(
    page.getByRole("main").locator('input[name="password"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with Google/ }),
  ).toBeVisible();
  await page.goto("/signup");
  await expect(
    page.getByRole("main").locator('input[name="passwordConfirmation"]'),
  ).toBeVisible();
});

test("student pages and legacy redirects use the authenticated workspace", async ({
  page,
  planner,
}) => {
  await login(page, planner);
  for (const path of [
    "/academic",
    "/profile",
    "/calendar",
    "/help",
    "/help/build-your-plan",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page).not.toHaveURL(/\/login/);
  }
  for (const [previous, current] of [
    ["/history", "/academic"],
    ["/timetable", "/calendar"],
  ]) {
    await page.goto(previous);
    await expect(page).toHaveURL(new RegExp(`${current}$`));
  }
});

test("key dates expose the calendar controls", async ({ page }) => {
  await page.goto("/key-dates");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByLabel("Calendar year")).toBeVisible();
});

test("administrator pages use live users and roles", async ({
  page,
  administrator,
}) => {
  await login(page, administrator);
  for (const path of ["/admin/dashboard", "/admin/users", "/admin/roles"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toContainText("Application error");
  }
  await page.goto("/admin/users");
  await expect(page.getByRole("main")).toContainText(administrator.email);
});

test("retired import and component-reference routes stay absent", async ({
  page,
  administrator,
}) => {
  await login(page, administrator);
  for (const path of [
    "/admin/relations",
    "/admin/imports/new",
    "/admin/imports/activity",
    "/admin/imports/history",
    "/admin/imports/runs",
    "/admin/imports/structures/runs",
    "/api/admin/course-imports",
    "/api/queues/course-import",
    "/design-system",
    "/design-system/typography",
    "/admin/design-system/components",
    "/admin/design-system/foundations",
    "/admin/design-system-preview/tokens/foundations",
    "/api/design-system/review",
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(404);
  }
});

test("indoor search, room links and the editor use a published database map", async ({
  page,
  administrator,
  indoorMap,
}) => {
  await login(page, administrator);
  await page.goto("/rooms?q=G01");
  await expect(
    page.getByRole("region", { name: "Search results" }),
  ).toContainText("G01");
  await page.goto(`/rooms?room=${indoorMap.roomId}`);
  await expect(
    page.getByRole("group", { name: "Building floors", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Indoor directions", exact: true }),
  ).toContainText("Take the lift");
  await page.goto(`/admin/rooms/${indoorMap.buildingSlug}`);
  await expect(page.getByLabel("Floor plan canvas")).toBeVisible();
  for (const tool of ["Select", "Wall", "Door", "Stairs", "Lift"]) {
    await expect(
      page
        .getByLabel("Floor plan tools")
        .getByRole("button", { name: tool, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByLabel("Save indoor map", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Import SVG" })).toHaveCount(0);
});

test("application pages share the wide content limit", async ({
  page,
  administrator,
}) => {
  await login(page, administrator);
  await page.setViewportSize({ width: 2048, height: 1000 });
  for (const route of ["/dashboard", "/courses", "/calendar", "/admin/users"]) {
    await page.goto(route);
    const content = page.locator('[data-slot="page-content"]:visible');
    await content.waitFor({ state: "visible" });
    assert.equal(
      await content.evaluate(
        (element) => element.getBoundingClientRect().width,
      ),
      1536,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page
      .locator('[data-slot="page-content"]:visible')
      .evaluate((element) => element.getBoundingClientRect().width <= 390),
  );
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`course tab indicators switch without a stray line in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/courses/2026/comp1100");
    const overview = page.getByRole("tab", { name: "Overview", exact: true });
    const offerings = page.getByRole("tab", { name: "Offerings", exact: true });
    await offerings.click();
    const indicator = (element: HTMLElement | SVGElement) => {
      const style = getComputedStyle(element, "::after");
      return {
        colour: style.backgroundColor,
        bottom: style.bottom,
        opacity: style.opacity,
        transition: style.transitionDuration,
      };
    };
    const inactive = await overview.evaluate(indicator);
    const active = await offerings.evaluate(indicator);
    assert.equal(inactive.colour, active.colour);
    assert.equal(inactive.bottom, "0px");
    assert.equal(active.bottom, "0px");
    assert.equal(inactive.opacity, "0");
    assert.equal(active.opacity, "1");
    assert.equal(inactive.transition, "0s");
    assert.equal(active.transition, "0s");
  });
}

test("course directory links retain the document while loading the course", async ({
  page,
}) => {
  await page.goto("/courses?q=COMP1100");
  const link = page.getByRole("link", {
    name: "Programming as Problem Solving",
    exact: true,
  });
  await link.waitFor({ state: "visible" });
  const documentOrigin = await page.evaluate(() => performance.timeOrigin);
  await link.click();
  await page
    .getByRole("heading", {
      name: "Programming as Problem Solving",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.evaluate(() => performance.timeOrigin),
    documentOrigin,
  );
});

// Exercise real painted surfaces rather than checking their class names.
test("rounded table and map surfaces keep all four corners", async ({
  page,
  administrator,
}) => {
  test.setTimeout(90_000);
  await login(page, administrator);
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/admin/roles");
    const groups = page
      .getByRole("region", { name: "Role permissions" })
      .locator("section");
    await expect(groups.first()).toBeVisible();
    for (const group of await groups.all()) await expectRoundedCorners(group);
    const firstGroup = groups.first();
    await firstGroup.getByRole("button", { name: /Platform access/ }).click();
    await expectRoundedCorners(firstGroup);

    for (const route of ["/courses", "/admin/users"]) {
      await page.goto(route);
      const surface = page.locator("[data-selectable]").first();
      await expect(surface).toBeVisible();
      await expectRoundedCorners(surface);
    }
    await page.goto("/admin/rooms");
    const buildingPicker = page.locator(
      '[data-slot="building-picker"]:not([aria-busy="true"])',
    );
    await expect(buildingPicker).toHaveCount(1);
    await expect(buildingPicker).toBeVisible();
    await expectRoundedCorners(
      buildingPicker.locator('[data-slot="building-picker-rail"]'),
    );
    await expectRoundedCorners(
      buildingPicker.locator('[data-slot="building-picker-map"]'),
    );
  }
});

test("pointer selection clears picker rings while keyboard focus remains visible", async ({
  page,
}) => {
  await page.goto("/key-dates");
  const trigger = page.getByRole("button", { name: "Calendar year" });
  const appearance = () =>
    trigger.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outline: style.outlineStyle,
        ring: style.getPropertyValue("--tw-ring-shadow"),
        border: style.borderColor,
      };
    });
  const resting = await appearance();
  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { pressed: true }).click();
  await expect(trigger).toBeFocused();
  await expect.poll(appearance).toEqual(resting);
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect.poll(appearance).not.toEqual(resting);
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { pressed: true }).click();
  await expect.poll(appearance).toEqual(resting);
});

test("text fields keep pointer focus rings without passing them to buttons or links", async ({
  page,
}) => {
  await page.goto("/login");
  const email = page.getByRole("textbox", { name: "Email address" });
  const ring = () =>
    email.evaluate((element) => getComputedStyle(element).boxShadow);
  const resting = await ring();
  await email.click();
  await expect(email).toBeFocused();
  await expect.poll(ring).not.toEqual(resting);

  for (const control of [
    page.getByRole("button", { name: "Continue with Google" }),
    page.getByRole("link", { name: "Create an account" }),
  ]) {
    await email.click();
    // Menu and dialog libraries restore focus programmatically from text entry.
    await control.focus();
    await expect(control).toBeFocused();
    await expect
      .poll(() =>
        control.evaluate((element) => ({
          outline: getComputedStyle(element).outlineStyle,
          ring: getComputedStyle(element).getPropertyValue("--tw-ring-shadow"),
        })),
      )
      .toEqual({ outline: "none", ring: "0 0 #0000" });
    await page.keyboard.press("Tab");
    await control.focus();
    await expect
      .poll(() =>
        control.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            style.outlineStyle !== "none" ||
            style.getPropertyValue("--tw-ring-shadow") !== "0 0 #0000"
          );
        }),
      )
      .toBe(true);
    // Preserve the browser's native :focus-visible state to reproduce a stale
    // ring during pointer-driven focus return, independently of its heuristics.
    await control.dispatchEvent("pointerdown", { pointerType: "mouse" });
    expect(
      await control.evaluate((element) => element.matches(":focus-visible")),
    ).toBe(true);
    await expect
      .poll(() =>
        control.evaluate((element) => ({
          outline: getComputedStyle(element).outlineStyle,
          ring: getComputedStyle(element).getPropertyValue("--tw-ring-shadow"),
        })),
      )
      .toEqual({ outline: "none", ring: "0 0 #0000" });
  }
});

for (const width of [1440, 390]) {
  test(`returning from a course restores its programme after a section jump at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/programmes/2026/bcomp?tab=information");
    await expect(
      page.getByRole("heading", { name: "Bachelor of Computing", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "First-year advice", exact: true })
      .click();
    await expect(page).toHaveURL(
      /\/programmes\/2026\/bcomp\?tab=information#section-first_year_advice$/,
    );
    await page
      .getByRole("tabpanel", { name: "Information" })
      .getByRole("link", { name: "COMP1100", exact: true })
      .click();
    await expect(page).toHaveURL(/\/courses\/2026\/comp1100$/);
    await expect(
      page.getByRole("heading", {
        name: "Programming as Problem Solving",
        exact: true,
      }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(
      /\/programmes\/2026\/bcomp\?tab=information#section-first_year_advice$/,
    );
    await expect(
      page.getByRole("heading", { name: "Bachelor of Computing", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Information", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "First-year advice", exact: true }),
    ).toBeVisible();
  });
}
