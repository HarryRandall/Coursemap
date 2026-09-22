import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { appRoot, nextCliPath } from "../paths.mjs";
import { createLocalApplicationEnvironment } from "./supabase-environment.mjs";

export function startLocalProductionPreview({
  environment = createLocalApplicationEnvironment(),
  runBuild = spawnSync,
  spawnServer = spawn,
} = {}) {
  const build = runBuild("pnpm", ["run", "build"], {
    cwd: appRoot,
    env: environment,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    return { child: null, exitCode: build.status ?? 1 };
  }

  const child = spawnServer(
    process.execPath,
    [nextCliPath, "start", "--hostname", "127.0.0.1", "--port", "3000"],
    {
      cwd: appRoot,
      env: environment,
      stdio: "inherit",
    },
  );
  return { child, exitCode: null };
}

function run() {
  let result;
  try {
    result = startLocalProductionPreview();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (!result.child) process.exit(result.exitCode ?? 1);
  const child = result.child;

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run();
}
