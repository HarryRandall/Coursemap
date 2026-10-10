import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const turbo = join(dirname(require.resolve("turbo/package.json")), "bin/turbo");
const config = readFileSync(
  new URL("../../../turbo.json", import.meta.url),
  "utf8",
);
const roots = [];

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "coursemap-turbo-inputs-"));
  roots.push(root);
  const files = {
    "package.json": JSON.stringify({
      name: "cache-regression",
      private: true,
      packageManager: "pnpm@12.3.4",
    }),
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "pnpm-lock.yaml":
      "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/web: {}\n",
    "turbo.json": config,
    "apps/web/package.json": JSON.stringify({
      name: "@coursemap/web",
      scripts: { "test:unit": "exit 0" },
    }),
    "apps/web/tests/example.test.mjs": "// Package-local test input.\n",
    ".github/workflows/ci.yml": "name: CI\n",
    ".github/dependabot.yml": "version: 2\n",
  };
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  }
  return root;
}

function testHash(root) {
  const run = JSON.parse(
    execFileSync(
      turbo,
      ["run", "test:unit", "--filter=@coursemap/web", "--dry=json"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          TURBO_TELEMETRY_DISABLED: "1",
          TURBO_TOKEN: "",
          TURBO_TEAM: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  const task = run.tasks.find(
    (item) => item.taskId === "@coursemap/web#test:unit",
  );
  expect(task).toBeDefined();
  return task.hash;
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test.each([".github/workflows/ci.yml", ".github/dependabot.yml"])(
  "changing %s invalidates the web unit-test cache",
  (file) => {
    const root = workspace();
    const before = testHash(root);
    writeFileSync(
      join(root, file),
      readFileSync(join(root, file), "utf8") + "# Changed configuration.\n",
    );
    expect(testHash(root)).not.toBe(before);
  },
);

test("package-local tests remain inputs of the web unit-test cache", () => {
  const root = workspace();
  const before = testHash(root);
  writeFileSync(
    join(root, "apps/web/tests/example.test.mjs"),
    "// Changed test.\n",
  );
  expect(testHash(root)).not.toBe(before);
});
