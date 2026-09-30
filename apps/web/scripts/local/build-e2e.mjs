import { spawnSync } from "node:child_process";
import { appRoot } from "../paths.mjs";
import { localTestEnvironment } from "./test-environment.mjs";
const result = spawnSync("pnpm", ["build:prod"], {
  cwd: appRoot,
  env: { ...process.env, ...localTestEnvironment() },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
