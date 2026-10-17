#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { createLocalApplicationEnvironment } from "../local/supabase-environment.mjs";
import { createLocalDatabaseClient } from "./lib/local-database.mjs";
import {
  publishAgentDraft,
  readAgentPublicationCandidates,
} from "./lib/agent-publication.mjs";
import {
  YEAR_IMPORT_KINDS,
  readLocalAdministrator,
} from "./lib/year-import.mjs";

const USAGE = `Usage: pnpm catalogue:agent-publish --year 2026 [--kinds course,major] [--dry-run]

Publishes untouched, error-free drafts from agent-answered imports in the local
database, accepting their first readings as the local administrator.`;

export async function main(args = process.argv.slice(2)) {
  let year = null;
  let kinds = YEAR_IMPORT_KINDS;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--year") year = Number(args[(index += 1)]);
    else if (args[index] === "--kinds") kinds = args[(index += 1)].split(",");
    else if (args[index] === "--dry-run") dryRun = true;
    else throw new Error(USAGE);
  }
  if (!Number.isInteger(year)) throw new Error(USAGE);
  Object.assign(process.env, createLocalApplicationEnvironment());
  delete process.env.COURSEMAP_SYNC_DATABASE_URL;

  const { resolveSourceChange } =
    await import("../../lib/catalogue/source-review-decisions.ts");
  const { publishCatalogueDraft } =
    await import("../../lib/catalogue/drafts.ts");
  const sql = await createLocalDatabaseClient();
  try {
    const userId = await readLocalAdministrator(sql);
    const candidates = await readAgentPublicationCandidates(sql, {
      year,
      kinds,
    });
    console.log(`${year}: ${candidates.length} drafts ready to publish.`);
    if (dryRun) return;
    let published = 0;
    const held = [];
    for (const candidate of candidates) {
      try {
        await publishAgentDraft(sql, {
          recordId: candidate.id,
          userId,
          resolveSourceChange,
          publishCatalogueDraft,
        });
        published += 1;
      } catch (error) {
        held.push(
          `${candidate.kind} ${candidate.code}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    console.log(`${year}: published ${published}, held ${held.length}.`);
    for (const line of held) console.log(`  ${line}`);
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
