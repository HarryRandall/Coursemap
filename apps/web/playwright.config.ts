import { localTestEnvironment } from "./scripts/local/test-environment.mjs";
import { defineConfig } from "@playwright/test";

// The package scripts select the profile and build its matching environment.
// Access tests use an unavailable database; authenticated journeys use local Supabase.
const profile = process.env.COURSEMAP_TEST_PROFILE ?? "authenticated";
const port = profile === "access" ? 4318 : 4319;
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./playwright",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: origin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: profile,
      testMatch:
        profile === "authenticated"
          ? [
              "authenticated.spec.*",
              "rendered.spec.*",
              "catalogue-admin.spec.*",
            ]
          : "access.spec.*",
    },
  ],
  webServer: {
    // Both profiles use the production build in .next, so run them sequentially.
    command: `pnpm exec next start --hostname 127.0.0.1 --port ${port}`,
    url: `${origin}/login`,
    // Start a test-owned server so a developer session cannot change the test environment.
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...(profile === "authenticated" ? localTestEnvironment() : {}),
      NEXT_PUBLIC_SITE_URL: origin,
      ...(profile === "access"
        ? {
            NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
          }
        : {}),
    },
  },
});
