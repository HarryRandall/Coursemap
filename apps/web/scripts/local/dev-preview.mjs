import { appRoot, repositoryRoot } from "../paths.mjs";
import { spawn, spawnSync } from "node:child_process";

export function parseSupabaseEnvironment(output) {
  const values = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(?:"([^"]*)"|(.*))$/);
    if (match) values.set(match[1], match[2] ?? match[3] ?? "");
  }

  return {
    apiUrl: values.get("API_URL"),
    databaseUrl: values.get("DB_URL"),
    publishableKey: values.get("PUBLISHABLE_KEY") ?? values.get("ANON_KEY"),
    secretKey: values.get("SECRET_KEY") ?? values.get("SERVICE_ROLE_KEY"),
  };
}

function readSupabaseEnvironment() {
  const result = spawnSync("supabase", ["status", "-o", "env"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    console.error(
      "Local Supabase is unavailable. Run `pnpm db:start` before `pnpm dev:local`.",
    );
    process.exit(result.status ?? 1);
  }

  const { apiUrl, databaseUrl, publishableKey, secretKey } =
    parseSupabaseEnvironment(result.stdout);
  if (!apiUrl || !publishableKey || !secretKey) {
    console.error(
      "Supabase did not return its local API URL, public key and server key.",
    );
    process.exit(1);
  }

  return { apiUrl, databaseUrl, publishableKey, secretKey };
}

const { apiUrl, databaseUrl, publishableKey, secretKey } =
  readSupabaseEnvironment();
const child = spawn(
  "pnpm",
  ["run", "dev", "--hostname", "127.0.0.1", "--port", "3000"],
  {
    cwd: appRoot,
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
      // The import pipeline and admin workspace connect to Postgres directly.
      COURSEMAP_DATABASE_URL: databaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      SUPABASE_SECRET_KEY: secretKey,
    },
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
