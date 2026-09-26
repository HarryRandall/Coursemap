import { nextCliPath, repositoryRoot } from "../scripts/paths.mjs";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
  resetLocalDatabase,
  resetLocalPreview,
} from "../scripts/local/reset-preview.mjs";
import { seedLocalPreview } from "../scripts/local/seed-preview.mjs";
import { buildLocalProduction } from "../scripts/local/build-preview.mjs";
import {
  developmentPort,
  startLocalDevelopmentPreview,
} from "../scripts/local/dev-preview.mjs";
import { startLocalProductionPreview } from "../scripts/local/production-preview.mjs";
import { startBuiltLocalProduction } from "../scripts/local/start-preview.mjs";
import {
  createLocalApplicationEnvironment,
  parseSupabaseEnvironment,
} from "../scripts/local/supabase-environment.mjs";

test("keeps predictable preview credentials out of Supabase's default seed", async () => {
  const defaultSeed = await readFile(
    new URL("../../../supabase/seed.sql", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(defaultSeed, /test@test\.com/u);
  assert.doesNotMatch(defaultSeed, /encrypted_password/u);
  assert.doesNotMatch(defaultSeed, /local_mock/u);
});

test("the local preview publishes every selectable academic structure kind", async () => {
  const previewSeed = await readFile(
    new URL("../scripts/fixtures/local-preview.sql", import.meta.url),
    "utf8",
  );

  for (const kind of ["programme", "major", "minor", "specialisation"]) {
    assert.match(previewSeed, new RegExp(`'${kind}'`, "u"));
  }
  assert.match(previewSeed, /LOCAL-MAJ/u);
  assert.match(previewSeed, /LOCALA-MIN/u);
  assert.match(previewSeed, /LOCALB-MIN/u);
  assert.match(previewSeed, /LOCAL-SPEC/u);
  assert.match(previewSeed, /set published_version_id = snapshots\.id/u);
});

test("passes the local server key to durable import workers", () => {
  const supabaseEnvironment = parseSupabaseEnvironment(
    [
      'API_URL="http://127.0.0.1:54321"',
      'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
      'ANON_KEY="public-key"',
      'SERVICE_ROLE_KEY="server-key"',
    ].join("\n"),
  );
  const environment = createLocalApplicationEnvironment({
    baseEnvironment: { KEEP_ME: "yes" },
    supabaseEnvironment,
  });

  assert.equal(environment.KEEP_ME, "yes");
  assert.equal(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseEnvironment.apiUrl,
  );
  assert.equal(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "public-key");
  assert.equal(environment.SUPABASE_SECRET_KEY, "server-key");
  assert.equal(
    environment.COURSEMAP_DATABASE_URL,
    supabaseEnvironment.databaseUrl,
  );
});

test("builds and starts the production preview with the same local environment", () => {
  const calls = [];
  const child = new EventEmitter();
  const environment = { LOCAL_PREVIEW: "true" };

  const result = startLocalProductionPreview({
    environment,
    runBuild(executable, args, options) {
      calls.push({ executable, args, options });
      return { status: 0 };
    },
    spawnServer(executable, args, options) {
      calls.push({ executable, args, options });
      return child;
    },
  });

  assert.equal(result.child, child);
  assert.equal(result.exitCode, null);
  assert.deepEqual(calls, [
    {
      executable: "pnpm",
      args: ["run", "build"],
      options: {
        cwd: new URL("../", import.meta.url).pathname,
        env: environment,
        stdio: "inherit",
      },
    },
    {
      executable: process.execPath,
      args: [nextCliPath, "start", "--hostname", "127.0.0.1", "--port", "3000"],
      options: {
        cwd: new URL("../", import.meta.url).pathname,
        env: environment,
        stdio: "inherit",
      },
    },
  ]);
});

test("the standalone build and start commands also inject the local environment", () => {
  const calls = [];
  const environment = { LOCAL_PREVIEW: "true" };
  const child = new EventEmitter();

  const buildStatus = buildLocalProduction({
    environment,
    runCommand(executable, args, options) {
      calls.push({ executable, args, options });
      return { status: 0 };
    },
  });
  const server = startBuiltLocalProduction({
    environment,
    spawnCommand(executable, args, options) {
      calls.push({ executable, args, options });
      return child;
    },
  });

  assert.equal(buildStatus, 0);
  assert.equal(server, child);
  assert.deepEqual(
    calls.map(({ args, options }) => ({ args, environment: options.env })),
    [
      { args: ["run", "build:next"], environment },
      {
        args: [
          nextCliPath,
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          "3000",
        ],
        environment,
      },
    ],
  );
});

test("development starts Next directly so stopping it cannot orphan a server", () => {
  let command;
  const child = new EventEmitter();
  const environment = { LOCAL_PREVIEW: "true" };

  const server = startLocalDevelopmentPreview({
    environment,
    spawnCommand(executable, args, options) {
      command = { executable, args, options };
      return child;
    },
  });

  assert.equal(server, child);
  assert.deepEqual(command, {
    executable: process.execPath,
    args: [
      nextCliPath,
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    options: {
      cwd: new URL("../", import.meta.url).pathname,
      env: environment,
      stdio: "inherit",
    },
  });
});

test("runs the preview fixture through the verified local database client", async () => {
  const events = [];
  const sql = {
    async unsafe(seed) {
      events.push(["seed", seed]);
    },
    async end(options) {
      events.push(["end", options]);
    },
  };

  await seedLocalPreview({
    createClient: async () => sql,
    readSeed: async (path, encoding) => {
      assert.equal(
        path.pathname.endsWith("/scripts/fixtures/local-preview.sql"),
        true,
      );
      assert.equal(encoding, "utf8");
      return "select 'local preview';";
    },
  });

  assert.deepEqual(events, [
    ["seed", "select 'local preview';"],
    ["end", { timeout: 5 }],
  ]);
});

test("closes the local client when the preview fixture fails", async () => {
  let closed = false;
  const sql = {
    async unsafe() {
      throw new Error("seed failed");
    },
    async end() {
      closed = true;
    },
  };

  await assert.rejects(
    seedLocalPreview({
      createClient: async () => sql,
      readSeed: async () => "select broken;",
    }),
    /seed failed/u,
  );
  assert.equal(closed, true);
});

test("resets only the local database without applying the default seed", async () => {
  let command;
  const child = new EventEmitter();

  const result = resetLocalDatabase({
    spawnCommand(executable, args, options) {
      command = { executable, args, options };
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    },
  });

  await result;
  assert.deepEqual(command, {
    executable: "supabase",
    args: ["db", "reset", "--local", "--no-seed"],
    options: { stdio: "inherit", cwd: repositoryRoot },
  });
});

test("rejects forwarded reset arguments before touching Supabase", async () => {
  let resetCalled = false;

  await assert.rejects(
    resetLocalPreview({
      args: ["--linked"],
      resetDatabase: async () => {
        resetCalled = true;
      },
    }),
    /does not accept extra Supabase CLI arguments/u,
  );
  assert.equal(resetCalled, false);
});

test("applies the preview fixture only after the local reset succeeds", async () => {
  const events = [];

  await resetLocalPreview({
    resetDatabase: async () => events.push("reset"),
    seedPreview: async () => events.push("seed"),
  });

  assert.deepEqual(events, ["reset", "seed"]);
});

test("development runs on a chosen port so two checkouts can run together", () => {
  assert.equal(developmentPort([], {}), 3000);
  assert.equal(developmentPort(["--port", "3001"], {}), 3001);
  assert.equal(developmentPort(["--port=3002"], {}), 3002);
  assert.equal(developmentPort(["-p", "3003"], {}), 3003);
  assert.equal(developmentPort([], { PORT: "3004" }), 3004);
  assert.equal(developmentPort(["--port", "3005"], { PORT: "3004" }), 3005);
  assert.throws(() => developmentPort(["--port", "web"], {}), /1 to 65535/);

  let args;
  startLocalDevelopmentPreview({
    port: 3001,
    environment: {},
    spawnCommand(_executable, spawnArgs) {
      args = spawnArgs;
      return new EventEmitter();
    },
  });
  assert.deepEqual(args.slice(-2), ["--port", "3001"]);
  assert.equal(
    createLocalApplicationEnvironment({
      baseEnvironment: {},
      port: 3001,
      supabaseEnvironment: {},
    }).NEXT_PUBLIC_SITE_URL,
    "http://127.0.0.1:3001",
  );
});
