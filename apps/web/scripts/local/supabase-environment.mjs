import { spawnSync } from "node:child_process";
import { repositoryRoot } from "../paths.mjs";

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

export function readLocalSupabaseEnvironment({ runCommand = spawnSync } = {}) {
  const result = runCommand("supabase", ["status", "-o", "env"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      "Local Supabase is unavailable. Run `pnpm db:start` before starting a local preview.",
    );
  }

  const environment = parseSupabaseEnvironment(result.stdout);
  if (
    !environment.apiUrl ||
    !environment.databaseUrl ||
    !environment.publishableKey ||
    !environment.secretKey
  ) {
    throw new Error(
      "Supabase did not return its local API URL, database URL, public key and server key.",
    );
  }

  return environment;
}

export function createLocalApplicationEnvironment({
  baseEnvironment = process.env,
  supabaseEnvironment = readLocalSupabaseEnvironment(),
} = {}) {
  return {
    ...baseEnvironment,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
    // The import pipeline and admin workspace connect to Postgres directly.
    COURSEMAP_DATABASE_URL: supabaseEnvironment.databaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabaseEnvironment.publishableKey,
    NEXT_PUBLIC_SUPABASE_URL: supabaseEnvironment.apiUrl,
    SUPABASE_SECRET_KEY: supabaseEnvironment.secretKey,
  };
}
