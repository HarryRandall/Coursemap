import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("the local downloader protects credentials, retries safely and resumes uploads", () => {
  const path = fileURLToPath(
    new URL("../scripts/selt/test-import-reports.py", import.meta.url),
  );
  expect(() =>
    execFileSync("python3", [path], { stdio: "pipe" }),
  ).not.toThrow();
});
