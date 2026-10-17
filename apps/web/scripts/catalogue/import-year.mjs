#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { repositoryRoot } from "../paths.mjs";
import { createLocalApplicationEnvironment } from "../local/supabase-environment.mjs";
import { createLocalDatabaseClient } from "./lib/local-database.mjs";
import {
  YEAR_IMPORT_USAGE,
  createYearImportSyncs,
  ensureAgentImportModel,
  forEachConcurrently,
  parseYearImportArgs,
  readImportableRecords,
  readLocalAdministrator,
  summariseSyncs,
} from "./lib/year-import.mjs";

const DEFAULT_ANSWERS = resolve(repositoryRoot, ".catalogue-import");

/** Points every pipeline module at the local stack, never a hosted project. */
function applyLocalEnvironment(answers) {
  Object.assign(process.env, createLocalApplicationEnvironment(), {
    COURSEMAP_AGENT_EXTRACTION_DIR: answers,
    COURSEMAP_QUEUE_SYNCS_ENABLED: "false",
  });
  delete process.env.COURSEMAP_SYNC_DATABASE_URL;
  delete process.env.OPENROUTER_API_KEY;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(YEAR_IMPORT_USAGE);
    return;
  }
  const options = parseYearImportArgs(args);
  const answers = resolve(options.answers ?? DEFAULT_ANSWERS);
  await mkdir(answers, { recursive: true });
  applyLocalEnvironment(answers);

  const { refreshCatalogueDirectory } =
    await import("../../lib/catalogue-import/directory.ts");
  const { dispatchCatalogueSync, processCatalogueSyncInline } =
    await import("../../lib/catalogue-sync/sync-queue.ts");
  const { syncAdapterForKind } =
    await import("../../lib/catalogue-sync/process-sync.ts");
  const { bulkImportAdapter } =
    await import("../../lib/catalogue-runs/adapter.ts");

  const sql = await createLocalDatabaseClient();
  try {
    const adminId = await readLocalAdministrator(sql);
    await ensureAgentImportModel(sql);
    for (const kind of options.kinds) {
      if (!options.skipDirectory) {
        const listing = await refreshCatalogueDirectory({
          kind,
          academicYear: options.year,
        });
        console.log(
          `${options.year} ${kind}: listing refreshed (${JSON.stringify(listing)})`,
        );
      }
      const records = await readImportableRecords(sql, {
        kind,
        year: options.year,
        codes: options.codes,
        limit: options.limit,
        careers: options.careers,
      });
      if (!records.length) {
        console.log(`${options.year} ${kind}: nothing left to import.`);
        continue;
      }
      const adapter =
        kind === "programme"
          ? syncAdapterForKind(kind)
          : bulkImportAdapter(kind);
      const { runId, syncIds } = await createYearImportSyncs(sql, {
        kind,
        year: options.year,
        records,
        adapter,
        adminId,
      });
      console.log(
        `${options.year} ${kind}: importing ${records.length} records${runId ? ` (run ${runId})` : ""}.`,
      );
      let finished = 0;
      await forEachConcurrently(
        syncIds,
        options.concurrency,
        async (syncId) => {
          try {
            await dispatchCatalogueSync({ syncId });
            await processCatalogueSyncInline({ syncId, retryDelayMs: 2_000 });
          } catch (error) {
            console.error(
              `Sync ${syncId} stopped: ${error instanceof Error ? error.message : error}`,
            );
          }
          finished += 1;
          if (finished % 50 === 0 || finished === syncIds.length)
            console.log(
              `${options.year} ${kind}: ${finished}/${syncIds.length}`,
            );
        },
      );
      for (const row of await summariseSyncs(sql, syncIds))
        console.log(
          `  ${row.status}${row.errorCode ? ` ${row.errorCode}` : ""}: ${row.count} (${row.published} published)`,
        );
    }
    console.log(`Agent requests and answers: ${answers}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
