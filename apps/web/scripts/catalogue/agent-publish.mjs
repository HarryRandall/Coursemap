#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { createLocalApplicationEnvironment } from "../local/supabase-environment.mjs";
import { createLocalDatabaseClient } from "./lib/local-database.mjs";
import {
  publishAgentDraft,
  publishAgentFallbackDraft,
  readAgentPublicationCandidates,
} from "./lib/agent-publication.mjs";
import {
  YEAR_IMPORT_KINDS,
  readLocalAdministrator,
} from "./lib/year-import.mjs";

const USAGE = `Usage: pnpm catalogue:agent-publish --year 2026 [--kinds course,major] [--fallback] [--dry-run]

Publishes untouched, error-free drafts from agent-answered imports in the local
database, accepting their first readings as the local administrator.

--fallback publishes the untouched course drafts held only by requisite errors
instead: the modelled rule is kept, ANU's leftover wording becomes "Check with
ANU" notes that never block, and the errors become warnings for later review.`;

export async function main(args = process.argv.slice(2)) {
  let year = null;
  let kinds = YEAR_IMPORT_KINDS;
  let dryRun = false;
  let fallback = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--year") year = Number(args[(index += 1)]);
    else if (args[index] === "--kinds") kinds = args[(index += 1)].split(",");
    else if (args[index] === "--dry-run") dryRun = true;
    else if (args[index] === "--fallback") fallback = true;
    else throw new Error(USAGE);
  }
  if (!Number.isInteger(year)) throw new Error(USAGE);
  Object.assign(process.env, createLocalApplicationEnvironment());
  delete process.env.COURSEMAP_SYNC_DATABASE_URL;

  const { resolveSourceChange } =
    await import("../../lib/catalogue/source-review-decisions.ts");
  const { publishCatalogueDraft } =
    await import("../../lib/catalogue/drafts.ts");
  const { requisiteFallbackContent } =
    await import("../../lib/catalogue-import/requisite-fallback.ts");
  const { validateCatalogueContent } =
    await import("../../lib/catalogue/content.ts");
  const { diffSnapshotWrites } =
    await import("../../lib/catalogue-import/changes.ts");
  const sql = await createLocalDatabaseClient();
  try {
    const userId = await readLocalAdministrator(sql);
    const candidates = await readAgentPublicationCandidates(sql, {
      year,
      kinds,
      fallback,
    });
    console.log(
      `${year}: ${candidates.length} drafts ready to publish${fallback ? " with the requisite fallback" : ""}.`,
    );
    if (dryRun) {
      if (fallback)
        for (const candidate of candidates)
          console.log(`  ${candidate.kind} ${candidate.code}`);
      return;
    }
    let published = 0;
    const held = [];
    for (const candidate of candidates) {
      const options = {
        recordId: candidate.id,
        userId,
        resolveSourceChange,
        publishCatalogueDraft,
        requisiteFallbackContent,
        validateCatalogueContent,
        diffSnapshotWrites,
      };
      try {
        if (fallback) {
          const result = await publishAgentFallbackDraft(sql, options);
          console.log(
            `  ${candidate.code}: ${result.notes.length} notes, ${result.downgraded} errors now warnings${result.softened ? ", rule kept as soft" : ""}.`,
          );
        } else await publishAgentDraft(sql, options);
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
