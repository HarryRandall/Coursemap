import { readFileSync } from "node:fs";
import postgres from "postgres";
import { cleanCatalogueFixtures, expect, login, test } from "./fixtures";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

test("student course eligibility uses published programme college metadata and preserves missing data", async ({
  page,
  planner,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  const college = "ANU College of Arts and Social Sciences";
  const codes = ["COLLEGE-PROG", "MISSING-COLLEGE-PROG", "TSTE9908"];
  async function createProgramme(code: string, affiliation: string | null) {
    const [record] =
      await sql`select pg_temp.catalogue_item_year('programme',${code},2026::smallint) as id`;
    const [version] =
      await sql`insert into public.catalogue_versions(record_id,kind,academic_year_id,origin,content_hash) select id,'programme',academic_year_id,'manual',md5(${code}) || md5(${code}) from public.catalogue_records where id = ${record.id} returning id`;
    await sql`insert into public.structure_version_details(version_id,kind,name,units,duration_years,college) values(${version.id},'programme',${code},144,3,${affiliation})`;
    await sql`select pg_temp.publish_snapshot(${version.id})`;
    return version;
  }
  try {
    await sql.unsafe(
      readFileSync(
        new URL(
          "../../../supabase/tests/helpers/catalogue-fixtures.inc",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const programme = await createProgramme(codes[0], college);
    const missing = await createProgramme(codes[1], null);
    await cleanCatalogueFixtures(sql, async (tx) => {
      const [course] =
        await tx`select pg_temp.create_course_snapshot(${codes[2]},2026::smallint,'College eligibility browser test',p_level => 9000::smallint) as id`;
      const [rule] =
        await tx`insert into public.requirement_rules(version_id,academic_year_id,rule_kind,source_text,review_state,confidence) select ${course.id},academic_year_id,'prerequisite','You must be enrolled in a CASS degree.','verified',1 from public.catalogue_versions where id = ${course.id} returning id`;
      const [group] =
        await tx`insert into public.requirement_groups(rule_id,version_id,group_key,operator) values(${rule.id},${course.id},'prerequisite:root','all_of') returning id`;
      await tx`insert into public.requirement_conditions(rule_id,group_id,version_id,condition_key,condition_kind,free_text,source_text,review_state,confidence) values(${rule.id},${group.id},${course.id},'prerequisite:college','college_enrolment',${college},'You must be enrolled in a CASS degree.','verified',1)`;
      await tx`select pg_temp.publish_snapshot(${course.id})`;
    });
    const [plan] =
      await sql`select id from public.plans where owner_id = ${planner.id}::uuid and is_primary`;
    await sql`delete from public.plan_structures where plan_id = ${plan.id} and role = 'programme'`;
    await sql`insert into public.plan_structures(plan_id,owner_id,catalogue_record_id,role) select ${plan.id},${planner.id}::uuid,record_id,'programme' from public.catalogue_versions where id = ${programme.id}`;
    await login(page, planner);
    await page.goto(`/courses/2026/${codes[2].toLowerCase()}`);
    await page.getByRole("tab", { name: "Requisites", exact: true }).click();
    await expect(
      page.getByText(`Your programme is offered by ${college}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("1 of 1 met", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByText(`Your programme is offered by ${college}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath("college-eligibility-mobile.png"),
      fullPage: true,
    });
    await sql`delete from public.plan_structures where plan_id = ${plan.id} and role = 'programme'`;
    await sql`insert into public.plan_structures(plan_id,owner_id,catalogue_record_id,role) select ${plan.id},${planner.id}::uuid,record_id,'programme' from public.catalogue_versions where id = ${missing.id}`;
    await page.reload();
    await page.getByRole("tab", { name: "Requisites", exact: true }).click();
    await expect(
      page
        .getByRole("tabpanel", { name: "Requisites", exact: true })
        .getByText("Programme college information is missing or conflicting.", {
          exact: true,
        }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("tabpanel", { name: "Requisites", exact: true })
        .getByText("0 of 1 met", { exact: true }),
    ).toBeVisible();
  } finally {
    await sql`delete from public.plan_structures where owner_id = ${planner.id}::uuid`;
    await sql`delete from public.catalogue_listings where code in ${sql(codes)}`;
    await cleanCatalogueFixtures(sql, async (tx) => {
      await tx`delete from public.catalogue_codes where code in ${tx(codes)}`;
    });
    await sql.end();
  }
});
