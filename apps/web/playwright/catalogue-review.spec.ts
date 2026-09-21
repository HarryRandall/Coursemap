import postgres from "postgres";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { expect, login, test } from "./fixtures";

/**
 * Reviews a changed import through the record page: decide the changes,
 * acknowledge a blocking flag with a note, apply and publish. The reviewable
 * state is seeded directly: a candidate snapshot for the published COMP1110
 * and a ready target with its changes and flag.
 */
test("administrators review, apply and publish an import candidate", async ({
  page,
  administrator,
}) => {
  const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
    max: 1,
  });
  let runId: string | null = null;
  try {
    const [seed] = await sql`
      select item_years.id as record_id, item_years.academic_year_id, item_years.code_id,
        item_years.published_version_id, details.title
      from public.catalogue_records as item_years
      join public.catalogue_codes as items on items.id = item_years.code_id
      join public.course_version_details as details on details.version_id = item_years.published_version_id
      where items.code = 'COMP1110'
    `;
    expect(seed, "the local seed publishes COMP1110").toBeTruthy();

    const [model] =
      await sql`select id from public.import_models order by id limit 1`;
    const [run] = await sql`
      insert into public.catalogue_import_runs (
        academic_year_id, kind, requested_model, parser_version, prompt_version, schema_version,
        requested_by, target_count, status
      ) values (
        ${seed.academic_year_id}, 'course', ${model.id}, 'review', 'review', 'review',
        ${administrator.id}::uuid, 1, 'completed'
      ) returning id
    `;
    runId = String(run.id);
    const [target] = await sql`
      insert into public.catalogue_import_targets (
        run_id, kind, code, academic_year_id, code_id, record_id, baseline_version_id,
        status, change_kind, attempt_count, completed_at
      ) values (
        ${runId}::uuid, 'course', 'COMP1110', ${seed.academic_year_id}, ${seed.code_id},
        ${seed.record_id}, ${seed.published_version_id}, 'ready', 'changed', 1, now()
      ) returning id
    `;
    // The candidate copies the published snapshot with a revised title.
    const [candidate] = await sql`
      insert into public.catalogue_versions (
        record_id, kind, academic_year_id, origin, based_on_version_id, content_hash, import_target_id
      ) values (
        ${seed.record_id}, 'course', ${seed.academic_year_id}, 'import', ${seed.published_version_id},
        repeat('b', 64), ${target.id}::uuid
      ) returning id
    `;
    await sql`
      insert into public.course_version_details (
        version_id, title, unit_value_kind, units, minimum_units, maximum_units, eftsl, level,
        subject_code, subject_name, school, college, academic_career, convener_text, delivery_summary,
        introduction, description, workload_text, workload_hours, inherent_requirements,
        prescribed_texts, offering_status, source_updated_at
      )
      select ${candidate.id}, details.title || ' (revised)', details.unit_value_kind, details.units,
        details.minimum_units, details.maximum_units, details.eftsl, details.level, details.subject_code,
        details.subject_name, details.school, details.college, details.academic_career, details.convener_text,
        details.delivery_summary, details.introduction, 'A revised description for review.', details.workload_text,
        details.workload_hours, details.inherent_requirements, details.prescribed_texts, details.offering_status,
        details.source_updated_at
      from public.course_version_details as details where details.version_id = ${seed.published_version_id}
    `;
    await sql`update public.catalogue_import_targets set candidate_version_id = ${candidate.id} where id = ${target.id}::uuid`;
    await sql`
      insert into public.catalogue_import_changes (target_id, entry_kind, field_path, old_value, new_value, summary, position)
      values
        (${target.id}::uuid, 'change', 'course.details.title', to_jsonb(${seed.title}::text), to_jsonb((${seed.title}::text || ' (revised)')), 'Title changed', 0),
        (${target.id}::uuid, 'change', 'course.details.description', 'null'::jsonb, to_jsonb('A revised description for review.'::text), 'Description added', 1)
    `;
    await sql`
      insert into public.catalogue_import_changes (target_id, entry_kind, field_path, severity, is_blocking, issue_code, summary, position)
      values (${target.id}::uuid, 'flag', 'units', 'error', true, 'MISSING', 'The unit value could not be confirmed from the page.', 2)
    `;

    await login(page, administrator);
    await page.goto("/admin/courses/COMP1110?year=2026");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      seed.title,
    );
    // The verdict leads with what is left, and offers no publish control while
    // the reviewer still owes the record a decision.
    await expect(page.getByText("2 decisions outstanding")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish draft" }),
    ).toHaveCount(0);

    // Accept the title, reject the description.
    const titleRow = page
      .getByRole("row")
      .filter({ hasText: "Title" })
      .filter({ hasText: "(revised)" });
    await titleRow.getByRole("button", { name: "Accept" }).click();
    await expect(titleRow.getByText("Accepted")).toBeVisible();
    const descriptionRow = page
      .getByRole("row")
      .filter({ hasText: "A revised description for review." });
    await descriptionRow.getByRole("button", { name: "Reject" }).click();
    await expect(descriptionRow.getByText("Rejected")).toBeVisible();

    // A blocking flag needs a note before it is acknowledged.
    const flagRow = page
      .getByRole("listitem")
      .filter({ hasText: "Blocks publication" });
    await flagRow.getByRole("button", { name: "Acknowledge" }).click();
    await flagRow
      .getByLabel(/Why publication may proceed/)
      .fill("Checked units on the ANU page.");
    await flagRow.getByRole("button", { name: "Save and acknowledge" }).click();
    await expect(flagRow.getByText("Acknowledged")).toBeVisible();

    await page.getByRole("button", { name: "Apply to draft" }).click();
    await expect(page.getByText(/new draft combines/)).toBeVisible();

    // Only once nothing holds the record back does publishing become the
    // next step, and it confirms before students see anything.
    await expect(page.getByText("Ready to publish")).toBeVisible();
    await page.getByRole("button", { name: "Publish draft" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Publish", exact: true })
      .click();
    await expect(
      page.getByText("Published. Students now see this version."),
    ).toBeVisible();

    const [after] = await sql`
      select details.title, details.description
      from public.catalogue_records as item_years
      join public.course_version_details as details on details.version_id = item_years.published_version_id
      where item_years.id = ${seed.record_id}
    `;
    expect(after.title).toBe(`${seed.title} (revised)`);
    expect(after.description).not.toBe("A revised description for review.");

    await page.getByRole("tab", { name: "History" }).click();
    await expect(
      page.getByText("Published", { exact: true }).first(),
    ).toBeVisible();
  } finally {
    // Restore the seed: republish the original snapshot and remove the run.
    const [seed] = await sql`
      select item_years.id from public.catalogue_records as item_years
      join public.catalogue_codes as items on items.id = item_years.code_id where items.code = 'COMP1110'
    `;
    const [original] = await sql`
      select id from public.catalogue_versions where record_id = ${seed.id} and import_target_id is null
      order by created_at limit 1
    `;
    await sql`update public.catalogue_records set published_version_id = ${original.id} where id = ${seed.id}`;
    if (runId)
      await sql`delete from public.catalogue_import_runs where id = ${runId}::uuid`;
    await sql.end();
  }
});
