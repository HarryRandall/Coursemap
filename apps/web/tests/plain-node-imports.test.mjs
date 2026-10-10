import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "vitest";

test.each([
  ["../scripts/local/reset-preview.mjs", "resetLocalPreview"],
  ["../lib/catalogue-sync/provider-store.ts", "catalogueSyncDispatchAllowed"],
  ["../lib/catalogue-import/openrouter.ts", "restoreOpenRouterExtraction"],
])("imports %s under plain Node", (path, exportName) => {
  // A child process bypasses Vitest's server-only mock without running the script's main.
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import assert from "node:assert/strict";
       const module = await import(${JSON.stringify(new URL(path, import.meta.url).href)});
       assert.equal(typeof module[${JSON.stringify(exportName)}], "function");`,
    ],
    { encoding: "utf8", timeout: 10000 },
  );

  assert.equal(output, "");
});
