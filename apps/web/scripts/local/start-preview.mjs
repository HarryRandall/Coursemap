import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { appRoot, nextCliPath } from "../paths.mjs";
import { createLocalApplicationEnvironment } from "./supabase-environment.mjs";

export function startBuiltLocalProduction({
  environment = createLocalApplicationEnvironment(),
  spawnCommand = spawn,
} = {}) {
  return spawnCommand(
    process.execPath,
    [nextCliPath, "start", "--hostname", "127.0.0.1", "--port", "3000"],
    {
      cwd: appRoot,
      env: environment,
      stdio: "inherit",
    },
  );
}

function run() {
  let child;
  try {
    child = startBuiltLocalProduction();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

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
