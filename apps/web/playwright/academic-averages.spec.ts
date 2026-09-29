import postgres from "postgres";
import { expect, login, test } from "./fixtures";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

test("dashboard weights a failed attempt and its later repeat at desktop and mobile widths", async ({
  page,
  planner,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  try {
    const [version] = await sql`
      select records.published_version_id as id
      from public.catalogue_records as records
      join public.catalogue_codes as codes on codes.id = records.code_id
      join public.academic_years as years on years.id = records.academic_year_id
      where codes.code = 'COMP1100' and years.year = 2026
    `;
    expect(version?.id).toBeTruthy();
    const periods = await sql`
      select id, code from public.academic_periods
      where calendar_year = 2026 and code in ('S1', 'S2')
    `;
    const periodByCode = new Map(
      periods.map((period) => [period.code, period.id]),
    );
    expect(periodByCode.has("S1")).toBe(true);
    expect(periodByCode.has("S2")).toBe(true);
    await sql`
      insert into public.course_attempts
        (owner_id, academic_period_id, status, mark, grade,
         units_attempted, units_earned, catalogue_version_id)
      values
        (${planner.id}::uuid, ${periodByCode.get("S1")}, 'failed', 0, 'NCN', 6, 0, ${version.id}),
        (${planner.id}::uuid, ${periodByCode.get("S2")}, 'completed', 80, 'HD', 6, 6, ${version.id})
    `;

    await login(page, planner);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dashboard");
      const chart = page.getByRole("img", {
        name: "GPA by semester: S1 '26 0.0, S2 '26 7.0",
      });
      await expect(chart).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "GPA" }).locator(".."),
      ).toContainText("3.5");
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    }
  } finally {
    await sql`delete from public.course_attempts where owner_id = ${planner.id}::uuid`;
    await sql.end();
  }
});
