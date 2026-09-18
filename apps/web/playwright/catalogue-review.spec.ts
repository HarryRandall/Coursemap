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
      select item_years.id as item_year_id, item_years.academic_year_id, item_years.item_id,
        item_years.published_snapshot_id, details.title
      from public.catalogue_item_years as item_years
      join public.catalogue_items as items on items.id = item_years.item_id
      join public.course_snapshot_details as details on details.snapshot_id = item_years.published_snapshot_id
      where items.code = 'COMP1110' and item_years.draft_snapshot_id is null
    `;
    expect(
      seed,
      "the local seed publishes COMP1110 without a draft",
    ).toBeTruthy();

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
        run_id, kind, code, academic_year_id, item_id, item_year_id, baseline_snapshot_id,
        status, change_kind, attempt_count, completed_at
      ) values (
        ${runId}::uuid, 'course', 'COMP1110', ${seed.academic_year_id}, ${seed.item_id},
        ${seed.item_year_id}, ${seed.published_snapshot_id}, 'ready', 'changed', 1, now()
      ) returning id
    `;
    // The candidate copies the published snapshot with a revised title.
    const [candidate] = await sql`
      insert into public.catalogue_snapshots (
        item_year_id, kind, academic_year_id, origin, based_on_snapshot_id, content_hash, import_target_id
      ) values (
        ${seed.item_year_id}, 'course', ${seed.academic_year_id}, 'import', ${seed.published_snapshot_id},
        repeat('b', 64), ${target.id}::uuid
      ) returning id
    `;
    await sql`
      insert into public.course_snapshot_details (
        snapshot_id, title, unit_value_kind, units, minimum_units, maximum_units, eftsl, level,
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
      from public.course_snapshot_details as details where details.snapshot_id = ${seed.published_snapshot_id}
    `;
    await sql`update public.catalogue_import_targets set candidate_snapshot_id = ${candidate.id} where id = ${target.id}::uuid`;
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
    const publish = page.getByRole("button", { name: "Publish draft" });
    await expect(publish).toBeDisabled();

    // Accept the title, reject the description.
    const titleRow = page
      .getByRole("listitem")
      .filter({ hasText: "Title" })
      .filter({ hasText: "(revised)" });
    await titleRow.getByRole("button", { name: "Accept" }).click();
    await expect(titleRow.getByText("accepted")).toBeVisible();
    const descriptionRow = page
      .getByRole("listitem")
      .filter({ hasText: "A revised description for review." });
    await descriptionRow.getByRole("button", { name: "Reject" }).click();
    await expect(descriptionRow.getByText("rejected")).toBeVisible();

    // A blocking flag needs a note before it is acknowledged.
    const flagRow = page
      .getByRole("listitem")
      .filter({ hasText: "blocks publication" });
    await flagRow.getByRole("button", { name: "Acknowledge" }).click();
    await flagRow
      .getByLabel(/Why publication may proceed/)
      .fill("Checked units on the ANU page.");
    await flagRow.getByRole("button", { name: "Save and acknowledge" }).click();
    await expect(flagRow.getByText("acknowledged")).toBeVisible();

    await page.getByRole("button", { name: "Apply to draft" }).click();
    await expect(page.getByText(/new draft combines/)).toBeVisible();
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(
      page.getByText("Published. Students now see this version."),
    ).toBeVisible();

    const [after] = await sql`
      select details.title, details.description
      from public.catalogue_item_years as item_years
      join public.course_snapshot_details as details on details.snapshot_id = item_years.published_snapshot_id
      where item_years.id = ${seed.item_year_id}
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
      select item_years.id from public.catalogue_item_years as item_years
      join public.catalogue_items as items on items.id = item_years.item_id where items.code = 'COMP1110'
    `;
    const [original] = await sql`
      select id from public.catalogue_snapshots where item_year_id = ${seed.id} and import_target_id is null
      order by created_at limit 1
    `;
    await sql`update public.catalogue_item_years set draft_snapshot_id = null, published_snapshot_id = ${original.id} where id = ${seed.id}`;
    if (runId)
      await sql`delete from public.catalogue_import_runs where id = ${runId}::uuid`;
    await sql.end();
  }
});
