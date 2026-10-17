#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { repositoryRoot } from "../paths.mjs";
import {
  createHostedSyncDatabaseClient,
  createLocalDatabaseClient,
} from "./lib/local-database.mjs";
import {
  applyYearLoad,
  exportYearBundle,
  planYearLoad,
} from "./lib/year-bundle.mjs";

const KINDS = ["course", "major", "minor", "specialisation", "programme"];
const USAGE = `Usage: pnpm catalogue:load-year export --year 2026 [--kinds course,major] [--out FILE]
       pnpm catalogue:load-year plan --bundle FILE [--target local|hosted]
       pnpm catalogue:load-year apply --bundle FILE --confirm TOKEN [--target local|hosted] [--user-id UUID]

export writes the local database's published records for a year to a bundle.
plan is a dry run against the target: it lists records to publish, unchanged
records, records to unpublish and drafts to clear, with a token naming that
plan. apply recomputes the plan, refuses a changed target, and loads it.
A hosted target needs COURSEMAP_LOAD_ALLOW_HOSTED=1 and COURSEMAP_SYNC_DATABASE_URL.`;

function parse(args) {
  const [command, ...rest] = args;
  const options = { command, target: "local", kinds: KINDS };
  for (let index = 0; index < rest.length; index += 2) {
    const [flag, value] = [rest[index], rest[index + 1]];
    if (value === undefined) throw new Error(USAGE);
    if (flag === "--year") options.year = Number(value);
    else if (flag === "--kinds") options.kinds = value.split(",");
    else if (flag === "--out") options.out = value;
    else if (flag === "--bundle") options.bundle = value;
    else if (flag === "--target") options.target = value;
    else if (flag === "--confirm") options.confirm = value;
    else if (flag === "--user-id") options.userId = value;
    else throw new Error(USAGE);
  }
  return options;
}

async function connectTarget(target, env) {
  if (target === "local") return createLocalDatabaseClient();
  if (target !== "hosted") throw new Error(USAGE);
  if (
    env.COURSEMAP_LOAD_ALLOW_HOSTED !== "1" ||
    !env.COURSEMAP_SYNC_DATABASE_URL
  )
    throw new Error(
      "Loading a hosted database needs COURSEMAP_LOAD_ALLOW_HOSTED=1 and COURSEMAP_SYNC_DATABASE_URL.",
    );
  return createHostedSyncDatabaseClient(env.COURSEMAP_SYNC_DATABASE_URL);
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const options = parse(args);
  if (options.command === "export") {
    if (!Number.isInteger(options.year)) throw new Error(USAGE);
    const out = resolve(
      options.out ??
        join(
          repositoryRoot,
          ".catalogue-import",
          "bundles",
          `${options.year}.json`,
        ),
    );
    const sql = await createLocalDatabaseClient();
    try {
      const bundle = await exportYearBundle(sql, options);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, `${JSON.stringify(bundle)}\n`);
      const counts = {};
      for (const record of bundle.records)
        counts[record.kind] = (counts[record.kind] ?? 0) + 1;
      console.log(`${out}: ${JSON.stringify(counts)}`);
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }
  if (!["plan", "apply"].includes(options.command) || !options.bundle)
    throw new Error(USAGE);
  const bundle = JSON.parse(await readFile(resolve(options.bundle), "utf8"));
  const target = await connectTarget(options.target, env);
  try {
    if (options.command === "plan") {
      const plan = await planYearLoad(target, bundle);
      console.log(
        JSON.stringify(
          {
            target: options.target,
            year: plan.year,
            kinds: plan.kinds,
            publish: plan.publish.length,
            unchanged: plan.unchanged.length,
            unpublish: plan.unpublish.length,
            planReferencesToUnpublished: plan.plannedReferencesToUnpublished,
            draftsToClear: plan.draftsToClear,
            token: plan.token,
          },
          null,
          2,
        ),
      );
      const report = resolve(
        dirname(resolve(options.bundle)),
        `${plan.year}-${options.target}-plan.json`,
      );
      await writeFile(report, `${JSON.stringify(plan, null, 2)}\n`);
      console.log(`Full plan: ${report}`);
      return;
    }
    if (!options.confirm) throw new Error(USAGE);
    const result = await applyYearLoad(target, bundle, {
      token: options.confirm,
      userId: options.userId ?? null,
      onProgress: ({ published }) => console.log(`published ${published}`),
    });
    console.log(JSON.stringify(result));
  } finally {
    await target.end({ timeout: 5 });
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
