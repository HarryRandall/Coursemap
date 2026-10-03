import type { SyncSql } from "../catalogue-sync/sync-store.ts";
import { bulkImportAdapter, bulkImportInputCap } from "./adapter.ts";
import type { BulkImportKind } from "./kinds.ts";

export function courseRunAllowance(
  inputPrice: number,
  outputPrice: number,
  kind: BulkImportKind = "course",
) {
  if (
    ![inputPrice, outputPrice].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  )
    throw new TypeError("Current model pricing is required.");
  // One UTF-8 byte per token is a conservative bound; never assume cache hits.
  return (
    (bulkImportInputCap(kind) * inputPrice +
      bulkImportAdapter(kind).maxOutputTokens * outputPrice) /
    1_000_000
  );
}

export class CourseRunBudgetError extends Error {
  readonly code = "COURSE_RUN_BUDGET_HELD";
  readonly retryable = false;
}

export async function reserveCourseRunSpend(
  sql: SyncSql,
  syncId: string,
  inputBytes: number,
) {
  await sql.begin(async (tx) => {
    const [run] = await tx`
      select runs.* from public.catalogue_course_runs runs
      join public.catalogue_course_run_items items on items.run_id = runs.id
      where items.sync_id = ${syncId}::uuid for update of runs
    `;
    if (!run)
      throw new CourseRunBudgetError(
        "The source-first sync has no authorised import run.",
      );
    if (inputBytes > bulkImportInputCap(run.kind as BulkImportKind))
      throw new CourseRunBudgetError(
        "The request exceeds the input cap. Review this record individually.",
      );
    if (run.state !== "active")
      throw new CourseRunBudgetError(
        "This import run has stopped submitting paid requests.",
      );
    const [item] =
      await tx`select * from public.catalogue_course_run_items where sync_id = ${syncId}::uuid for update`;
    if (Number(item.reserved_usd) > 0 || item.actual_usd !== null) return;
    const [total] =
      await tx`select coalesce(sum(coalesce(actual_usd, reserved_usd)), 0) as used from public.catalogue_course_run_items where run_id = ${run.id}::uuid`;
    const allowance = courseRunAllowance(
      Number(run.input_usd_per_million),
      Number(run.output_usd_per_million),
      run.kind as BulkImportKind,
    );
    if (Number(total.used) + allowance > Number(run.budget_usd))
      throw new CourseRunBudgetError(
        "The remaining budget cannot cover another request. Increase the budget or start a smaller run.",
      );
    await tx`update public.catalogue_course_run_items set reserved_usd = ${allowance} where sync_id = ${syncId}::uuid`;
  });
}

export async function settleCourseRunSpend(
  sql: SyncSql,
  syncId: string,
  cost: number | null,
) {
  await sql.begin(async (tx) => {
    const [run] =
      await tx`select runs.* from public.catalogue_course_runs runs join public.catalogue_course_run_items items on items.run_id = runs.id where items.sync_id = ${syncId}::uuid for update of runs`;
    if (!run) return;
    const [item] =
      await tx`select reserved_usd from public.catalogue_course_run_items where sync_id = ${syncId}::uuid`;
    if (
      cost === null ||
      !Number.isFinite(cost) ||
      cost < 0 ||
      cost > Number(item.reserved_usd)
    ) {
      await tx`update public.catalogue_course_runs set state = 'paused', pause_reason = 'Provider cost is unknown or exceeds the reserved allowance. Reconcile spending before continuing.' where id = ${run.id}::uuid`;
      return;
    }
    await tx`update public.catalogue_course_run_items set actual_usd = ${cost} where sync_id = ${syncId}::uuid`;
  });
}
