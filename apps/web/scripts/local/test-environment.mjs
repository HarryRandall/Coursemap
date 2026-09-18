import { spawnSync } from "node:child_process";
import { repositoryRoot } from "../paths.mjs";

export function localTestEnvironment() {
  const workdir = process.env.COURSEMAP_TEST_SUPABASE_WORKDIR ?? repositoryRoot;
  const result = spawnSync(
    "supabase",
    ["status", "--workdir", workdir, "-o", "json"],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(
      "Start the dedicated local Supabase test stack before browser tests.",
    );
  const status = JSON.parse(result.stdout);
  for (const key of ["API_URL", "DB_URL"]) {
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(status[key]).hostname,
      )
    ) {
      throw new Error(`Browser tests refuse a hosted ${key}.`);
    }
  }
  return {
    COURSEMAP_DATABASE_URL: status.DB_URL,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:4319",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
    OPENROUTER_API_KEY: "",
  };
}
