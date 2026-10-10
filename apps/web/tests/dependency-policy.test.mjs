import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const workspace = readFileSync(
  new URL("../../../pnpm-workspace.yaml", import.meta.url),
  "utf8",
);
const dependabot = readFileSync(
  new URL("../../../.github/dependabot.yml", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("explicitly gates new dependency releases for one day", () => {
  expect(workspace).toMatch(/^minimumReleaseAge: 1440$/m);
});

test("npm updates observe the same one-day Dependabot cooldown", () => {
  const npm = dependabot
    .split("  - package-ecosystem: npm\n")[1]
    .split("  - package-ecosystem:")[0];
  expect(npm).toMatch(/    cooldown:\n      default-days: 1\n/);
});

test("does not install or catalogue the retired React Flow dependency", () => {
  expect(manifest.dependencies).not.toHaveProperty("@xyflow/react");
  expect(workspace).not.toContain('"@xyflow/react":');
});
