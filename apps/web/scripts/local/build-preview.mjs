import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { appRoot } from "../paths.mjs";
import { createLocalApplicationEnvironment } from "./supabase-environment.mjs";

export function buildLocalProduction({
  environment = createLocalApplicationEnvironment(),
  runCommand = spawnSync,
} = {}) {
  return runCommand("pnpm", ["run", "build:next"], {
    cwd: appRoot,
    env: environment,
    stdio: "inherit",
  }).status;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let status;
  try {
    status = buildLocalProduction();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  process.exit(status ?? 1);
}
