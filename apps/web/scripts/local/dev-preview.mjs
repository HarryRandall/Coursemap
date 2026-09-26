import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { appRoot, nextCliPath } from "../paths.mjs";
import { createLocalApplicationEnvironment } from "./supabase-environment.mjs";

export const DEFAULT_DEVELOPMENT_PORT = 3000;

/**
 * The port from `--port 3001`, `--port=3001` or `-p 3001`, then from `PORT`,
 * so a second checkout can run beside one already on the default port.
 * Throws when the value is not a usable TCP port.
 */
export function developmentPort(
  args = process.argv.slice(2),
  environment = process.env,
) {
  let value = environment.PORT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--port" || arg === "-p") value = args[index + 1];
    else if (arg.startsWith("--port=")) value = arg.slice("--port=".length);
  }
  if (value === undefined || value === "") return DEFAULT_DEVELOPMENT_PORT;

  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`The port "${value}" must be a number from 1 to 65535.`);
  }
  return port;
}

export function startLocalDevelopmentPreview({
  port = DEFAULT_DEVELOPMENT_PORT,
  environment = createLocalApplicationEnvironment({ port }),
  spawnCommand = spawn,
} = {}) {
  return spawnCommand(
    process.execPath,
    [
      nextCliPath,
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
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
    child = startLocalDevelopmentPreview({ port: developmentPort() });
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
