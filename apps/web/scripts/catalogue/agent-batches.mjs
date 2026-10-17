#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { repositoryRoot } from "../paths.mjs";
import {
  DEFAULT_BATCH_SIZE,
  applyBatchAnswers,
  carryAnswers,
  prepareBatches,
  readPendingRequests,
  rekeyAnswers,
} from "./lib/agent-batches.mjs";

const USAGE = `Usage: pnpm catalogue:agent-batches status
       pnpm catalogue:agent-batches prepare [--size ${DEFAULT_BATCH_SIZE}] [--schema NAME]
       pnpm catalogue:agent-batches apply BATCH.json [BATCH.json ...] | --all
       pnpm catalogue:agent-batches rekey PREVIOUS_REQUESTS_DIR
       pnpm catalogue:agent-batches carry

prepare groups unanswered requests into batches/<schema>-NNNN.json.
A subagent answers a batch by writing batches/<schema>-NNNN.answers.json,
an object of item id to answer. A second, independent subagent checks each
answer against the source and writes batches/<schema>-NNNN.verdicts.json,
an object of item id to { approve, reason }. apply saves approved answers
that the import adapter accepts, for every request sharing their wording.
rekey gives regenerated requests the answers their records already had.
carry gives course and structure requests the answer of another year's
request with identical wording.`;

const ROOT = resolve(
  process.env.COURSEMAP_AGENT_EXTRACTION_DIR ??
    join(repositoryRoot, ".catalogue-import"),
);

async function adapterValidator() {
  const { compactCourseAdapter } =
    await import("../../lib/catalogue-import/kinds/course/compact-adapter.ts");
  const { compactStructureAdapter } =
    await import("../../lib/catalogue-import/kinds/structure/compact-adapter.ts");
  const { syncAdapterForKind } =
    await import("../../lib/catalogue-sync/process-sync.ts");
  const adapters = new Map(
    [
      compactCourseAdapter,
      compactStructureAdapter,
      syncAdapterForKind("programme"),
    ].map((adapter) => [adapter.schemaName, adapter]),
  );
  return ({ kind, code, academicYear, schemaName, answer }) => {
    const adapter = adapters.get(schemaName);
    if (!adapter) return [`No adapter validates ${schemaName}.`];
    const outcome = adapter.validateModelOutput(
      { kind, code, academicYear },
      answer,
    );
    return outcome.success
      ? []
      : outcome.issues.map((issue) => `${issue.path}: ${issue.message}`);
  };
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (command === "status") {
    const pending = await readPendingRequests(ROOT);
    const counts = {};
    for (const request of pending)
      counts[request.schemaName] = (counts[request.schemaName] ?? 0) + 1;
    console.log(JSON.stringify({ root: ROOT, pending: counts }, null, 2));
    return;
  }
  if (command === "prepare") {
    let size = DEFAULT_BATCH_SIZE;
    let schemaName = null;
    for (let index = 0; index < rest.length; index += 2) {
      if (rest[index] === "--size") size = Number(rest[index + 1]);
      else if (rest[index] === "--schema") schemaName = rest[index + 1];
      else throw new Error(USAGE);
    }
    const written = await prepareBatches(ROOT, { size, schemaName });
    for (const batch of written)
      console.log(`${batch.file}: ${batch.items} items`);
    console.log(`${written.length} batches in ${join(ROOT, "batches")}`);
    return;
  }
  if (command === "apply") {
    const files =
      rest[0] === "--all"
        ? (await readdir(join(ROOT, "batches"))).filter(
            (name) =>
              name.endsWith(".json") &&
              !name.endsWith(".answers.json") &&
              rest.length === 1,
          )
        : rest;
    const validate = await adapterValidator();
    const available = new Set(await readdir(join(ROOT, "batches")));
    for (const file of files) {
      if (
        !available.has(file.replace(/\.json$/, ".answers.json")) ||
        !available.has(file.replace(/\.json$/, ".verdicts.json"))
      )
        continue;
      const result = await applyBatchAnswers(ROOT, file, { validate });
      console.log(
        `${file}: ${result.saved} saved, ${result.rejected.length} rejected, ${result.invalid.length} invalid, ${result.missing.length} missing`,
      );
      for (const item of result.rejected)
        console.log(`  rejected ${item.id} ${item.record}: ${item.reason}`);
      for (const item of result.invalid)
        console.log(`  ${item.id} ${item.record}: ${item.issues.join("; ")}`);
    }
    return;
  }
  if (command === "rekey" && rest.length === 1) {
    const result = await rekeyAnswers(ROOT, resolve(rest[0]), {
      validate: await adapterValidator(),
    });
    console.log(
      `${result.rekeyed} rekeyed, ${result.invalid.length} invalid, ${result.unmatched} without a previous answer`,
    );
    for (const item of result.invalid)
      console.log(`  ${item.record}: ${item.issues.join("; ")}`);
    return;
  }
  if (command === "carry" && rest.length === 0) {
    const result = await carryAnswers(ROOT, {
      validate: await adapterValidator(),
    });
    console.log(
      `${result.carried} carried, ${result.unmatched} without a match, ${result.invalid.length} failed validation`,
    );
    for (const item of result.invalid)
      console.log(`  ${item.record}: ${item.issues.join("; ")}`);
    return;
  }
  console.log(USAGE);
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
