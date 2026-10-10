#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createHostedSyncDatabaseClient,
  createLocalDatabaseClient,
} from "./lib/local-database.mjs";
import {
  confirmRetentionPlan,
  parseRetentionArgs,
  resolveRetentionTarget,
} from "./lib/retention-policy.mjs";
import {
  createRetentionStorageClient,
  deleteRetentionBatch,
  readRetentionPlan,
  removeRetentionObjects,
} from "./lib/retention-store.mjs";

const USAGE = `Usage: corepack pnpm catalogue:retention [--days 90 | --cutoff ISO_DATE] [--report PATH]
       corepack pnpm catalogue:retention --cutoff ISO_DATE --apply --confirm TOKEN [--report PATH]

Defaults to a local dry run. Hosted reads and writes require explicit
COURSEMAP_RETENTION_ALLOW_HOSTED=1 and COURSEMAP_SYNC_DATABASE_URL.
The owner must review the dry-run report and approve its token before applying.`;

export async function applyRetentionPlan({
  plan,
  confirm,
  deleteBatch,
  removeObjects,
  onProgress = async () => {},
}) {
  confirmRetentionPlan(plan, confirm);
  const summary = {
    token: plan.token,
    target: plan.target,
    cutoff: plan.cutoff,
    status: "applying",
    deleted: { changes: 0, artifacts: 0, stages: 0, objects: 0 },
    startedAt: new Date().toISOString(),
  };
  try {
    for (const category of ["changes", "artifacts", "stages", "objects"]) {
      const size = category === "objects" ? 20 : 50;
      for (
        let index = 0;
        index < plan.candidates[category].length;
        index += size
      ) {
        const rows = plan.candidates[category].slice(index, index + size);
        summary.pendingBatch = { category, ids: rows.map((row) => row.id) };
        await onProgress(summary);
        summary.deleted[category] +=
          category === "objects"
            ? await removeObjects(rows)
            : await deleteBatch(category, rows);
        delete summary.pendingBatch;
        await onProgress(summary);
      }
    }
    summary.status = "complete";
  } catch (error) {
    summary.status = "partial_failure";
    summary.error =
      error instanceof Error ? error.message : "The retention batch failed.";
  }
  summary.finishedAt = new Date().toISOString();
  await onProgress(summary);
  return summary;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(USAGE);
    return;
  }
  const options = parseRetentionArgs(args);
  const target = await resolveRetentionTarget(env);
  const sql = target.hosted
    ? createHostedSyncDatabaseClient(target.connectionString)
    : await createLocalDatabaseClient({
        env: { COURSEMAP_DATABASE_URL: target.connectionString },
      });
  try {
    const plan = await readRetentionPlan(sql, {
      cutoff: options.cutoff,
      target: target.target,
    });
    const reportPath = resolve(
      options.report ?? `/tmp/coursemap-retention-${plan.token}.json`,
    );
    // Write the complete reviewable plan before even constructing a mutator.
    await writeFile(
      reportPath,
      `${JSON.stringify({ mode: "dry_run", ...plan }, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify(
        {
          mode: "dry_run",
          target: plan.target,
          cutoff: plan.cutoff,
          token: plan.token,
          summary: plan.summary,
          rejected: plan.rejectedSummary,
          retained: plan.retained,
          reportPath,
        },
        null,
        2,
      ),
    );
    if (!options.apply) return;
    confirmRetentionPlan(plan, options.confirm);
    const storage = plan.candidates.objects.length
      ? createRetentionStorageClient(target, env)
      : null;
    const summaryPath = `${reportPath}.apply.json`;
    const summary = await applyRetentionPlan({
      plan,
      confirm: options.confirm,
      deleteBatch: (category, rows) =>
        deleteRetentionBatch(sql, plan, category, rows),
      removeObjects: (rows) => removeRetentionObjects(sql, plan, rows, storage),
      onProgress: (progress) =>
        writeFile(summaryPath, `${JSON.stringify(progress, null, 2)}\n`, {
          mode: 0o600,
        }),
    });
    console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
    if (summary.status !== "complete") process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (entrypoint === import.meta.url) {
  main().catch(() => {
    // Database connection errors can include credentials. Do not echo them.
    console.error(
      "Retention stopped. Check configuration, approval and the saved report; no further batches will run.",
    );
    process.exitCode = 1;
  });
}
