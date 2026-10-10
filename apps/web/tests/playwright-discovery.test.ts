import { matchesGlob } from "node:path";
import { readdirSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ environment: vi.fn(() => ({})) }));
const originalArgv = process.argv;

vi.mock("../scripts/local/test-environment.mjs", () => ({
  localTestEnvironment: mocks.environment,
}));

async function profileConfig(profile: string) {
  vi.stubEnv("COURSEMAP_TEST_PROFILE", profile);
  vi.resetModules();
  return (await import("../playwright.config")).default;
}

function matches(
  file: string,
  patterns: string | RegExp | (string | RegExp)[] = [],
) {
  return [patterns]
    .flat()
    .some((pattern) =>
      typeof pattern === "string"
        ? matchesGlob(file, pattern) ||
          matchesGlob(`playwright/${file}`, pattern)
        : pattern.test(file),
    );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  process.argv = originalArgv;
});

test.each(["authenticated", "access"])(
  "%s listing does not require a server or local database",
  async (profile) => {
    process.argv = ["node", "playwright", "test", "--list"];
    expect((await profileConfig(profile)).webServer).toBeUndefined();
    expect(mocks.environment).not.toHaveBeenCalled();
  },
);

test("authenticated execution still loads its dedicated local database environment", async () => {
  process.argv = ["node", "playwright", "test"];
  expect((await profileConfig("authenticated")).webServer).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        reuseExistingServer: false,
        url: "http://127.0.0.1:4319/login",
      }),
    ]),
  );
  expect(mocks.environment).toHaveBeenCalledOnce();
});

test("authenticated discovery retains every existing journey and excludes access tests", async () => {
  const config = await profileConfig("authenticated");
  const project = config.projects![0]!;
  const specs = readdirSync(new URL("../playwright/", import.meta.url)).filter(
    (file) => /\.spec\.(ts|mjs)$/.test(file),
  );
  expect(
    specs.filter(
      (file) =>
        matches(file, project.testMatch) && !matches(file, project.testIgnore),
    ),
  ).toEqual(specs.filter((file) => file !== "access.spec.mjs"));
});

test("authenticated discovery automatically includes a new spec", async () => {
  const config = await profileConfig("authenticated");
  const project = config.projects![0]!;
  expect(matches("future-regression.spec.ts", project.testMatch)).toBe(true);
  expect(matches("future-regression.spec.ts", project.testIgnore)).toBe(false);
});

test("access discovery only includes its unavailable-database spec", async () => {
  const config = await profileConfig("access");
  const project = config.projects![0]!;
  expect(matches("access.spec.mjs", project.testMatch)).toBe(true);
  expect(matches("future-regression.spec.ts", project.testMatch)).toBe(false);
});

test.each(["authenticated", "access"])(
  "%s uses Sydney time",
  async (profile) => {
    expect((await profileConfig(profile)).use?.timezoneId).toBe(
      "Australia/Sydney",
    );
  },
);
