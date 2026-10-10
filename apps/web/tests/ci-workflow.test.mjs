import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const roots = [];

function jobSource(name) {
  return workflow.split(`  ${name}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0];
}

function stepSource(name) {
  return workflow
    .split(`      - name: ${name}\n`)[1]
    .split(/\n(?:      - name:|  [\w-]+:\n)/)[0];
}

function stepCommand(name) {
  const source = stepSource(name);
  const [, style, command] = source.match(/        run: (\||>-)?\n?([\s\S]*)/);
  return style
    ? command
        .trimEnd()
        .split("\n")
        .map((line) => line.replace(/^          /, ""))
        .join(style === ">-" ? " " : "\n")
    : command.trim();
}

function repository() {
  const root = mkdtempSync(join(tmpdir(), "coursemap-ci-"));
  roots.push(root);
  function git(...args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  }
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "CI regression");
  git("config", "user.email", "ci@example.test");
  writeFileSync(join(root, "baseline.txt"), "Baseline\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "Baseline");
  const before = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", before);
  git("checkout", "--quiet", "-b", "change");
  return { root, git, before };
}

function whitespaceCheck(input, event, before = input.before) {
  return spawnSync(
    "bash",
    ["-e", "-c", stepCommand("Check for whitespace errors")],
    {
      cwd: input.root,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: event,
        BASE_REF: "main",
        PUSH_BEFORE: before,
      },
    },
  );
}

function commitFile(input, name, source) {
  writeFileSync(join(input.root, name), source);
  input.git("add", ".");
  input.git("commit", "--quiet", "-m", "Change");
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("route checkout fetches the history needed for the pull request merge base", () => {
  const routes = workflow.split("  routes:\n")[1].split("  database:\n")[0];
  expect(routes).toMatch(/fetch-depth: 0/);
  expect(stepSource("Check for whitespace errors")).toContain(
    "${{ github.base_ref }}",
  );
  expect(stepSource("Check for whitespace errors")).toContain(
    "${{ github.event.before }}",
  );
});

test("pull requests reject committed whitespace in a clean working tree", () => {
  const input = repository();
  commitFile(input, "bad.txt", "Trailing space \n");
  expect(input.git("status", "--porcelain")).toBe("");
  const result = whitespaceCheck(input, "pull_request");
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain("bad.txt:1: trailing whitespace.");
});

test("pushes check the whole pushed range rather than only the final commit", () => {
  const input = repository();
  commitFile(input, "bad.txt", "Trailing space \n");
  commitFile(input, "good.txt", "Clean\n");
  const result = whitespaceCheck(input, "push");
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain("bad.txt:1: trailing whitespace.");
});

test.each(["0000000000000000000000000000000000000000", "f".repeat(40)])(
  "pushes without an available previous commit still check HEAD (%s)",
  (before) => {
    const input = repository();
    commitFile(input, "bad.txt", "Trailing space \n");
    const result = whitespaceCheck(input, "push", before);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("bad.txt:1: trailing whitespace.");
  },
);

test.each(["pull_request", "push"])(
  "accepts clean committed changes on %s",
  (event) => {
    const input = repository();
    commitFile(input, "good.txt", "Clean\n");
    expect(whitespaceCheck(input, event).status).toBe(0);
  },
);

test("masks the encoded database password before exporting the connection URL", () => {
  const command = stepCommand("Prepare production database connection");
  const [, script] = command.match(/^node -e '([\s\S]*)'$/);
  const events = [];
  runInNewContext(script, {
    URL,
    process: {
      env: {
        SUPABASE_POOLER_URL:
          "postgresql://postgres.test@localhost:5432/postgres",
        SUPABASE_DB_PASSWORD: "test/@:%0A\r\nsecret",
        GITHUB_ENV: "test-env",
      },
    },
    console: { log: (line) => events.push(["log", line]) },
    require: () => ({
      appendFileSync: (file, line) => events.push(["write", file, line]),
    }),
  });
  expect(events[0][0]).toBe("log");
  expect(events[0][1]).toMatch(/^::add-mask::/);
  const masked = events[0][1]
    .slice("::add-mask::".length)
    .replaceAll("%0D", "\r")
    .replaceAll("%0A", "\n")
    .replaceAll("%25", "%");
  const exported = events[1][2];
  expect(events[1].slice(0, 2)).toEqual(["write", "test-env"]);
  const url = new URL(exported.trim().slice("SUPABASE_DB_URL=".length));
  expect(masked).toBe(url.password);
  expect(url.password).toContain("%0A");
  expect(exported.endsWith("\n")).toBe(true);
});

test("production deploys only after successful migrations on a push to main", () => {
  const deploy = jobSource("production-deploy");
  expect(deploy).toBeDefined();
  expect(deploy).toMatch(
    /if: github.event_name == 'push' && github.ref == 'refs\/heads\/main'/,
  );
  expect(deploy).toMatch(/needs: production-database\n/);
  expect(deploy).toMatch(/environment: Production\n/);
  expect(deploy).not.toMatch(/always\(|uses:|paths:|migrations.*outputs/);
  expect(stepSource("Trigger production deployment")).toContain(
    "${{ secrets.VERCEL_PRODUCTION_DEPLOY_HOOK }}",
  );
  expect(stepCommand("Apply production migrations")).toBe(
    'supabase db push --db-url "$SUPABASE_DB_URL" --yes',
  );
});

test("Vercel disables automatic main deployments and keeps branch previews", () => {
  const config = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  expect(config.git?.deploymentEnabled).toEqual({ "*": true, main: false });
});

function deployRequest(hook, curlStatus = 0) {
  const root = mkdtempSync(join(tmpdir(), "coursemap-deploy-"));
  roots.push(root);
  const argumentsFile = join(root, "curl-arguments");
  writeFileSync(
    join(root, "curl"),
    `#!/bin/bash\nprintf '%s\\n' "$@" > "$CURL_ARGUMENTS"\nif [ "$CURL_STATUS" != 0 ]; then\n  printf 'Request failed: %s\\n' "$VERCEL_PRODUCTION_DEPLOY_HOOK" >&2\nfi\nexit "$CURL_STATUS"\n`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    "bash",
    ["-e", "-c", stepCommand("Trigger production deployment")],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        VERCEL_PRODUCTION_DEPLOY_HOOK: hook,
        CURL_ARGUMENTS: argumentsFile,
        CURL_STATUS: String(curlStatus),
      },
    },
  );
  return { result, argumentsFile };
}

test("a missing production deploy hook fails clearly without making a request", () => {
  const { result, argumentsFile } = deployRequest("");
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain(
    "::error::VERCEL_PRODUCTION_DEPLOY_HOOK is not configured.",
  );
  expect(() => readFileSync(argumentsFile)).toThrow();
});

test("production deployment posts to the hook without logging its URL", () => {
  const hook = "https://example.test/deploy/private-test-hook";
  const { result, argumentsFile } = deployRequest(hook);
  expect(result.status).toBe(0);
  expect(readFileSync(argumentsFile, "utf8").trim().split("\n")).toEqual([
    "-fsS",
    "-X",
    "POST",
    hook,
    "--output",
    "/dev/null",
  ]);
  expect(result.stdout + result.stderr).not.toContain(hook);
});

test("a failed production deploy request fails without leaking curl diagnostics", () => {
  const hook = "https://example.test/deploy/private-test-hook";
  const { result } = deployRequest(hook, 22);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain(
    "::error::The Vercel production deploy hook request failed.",
  );
  expect(result.stdout + result.stderr).not.toContain(hook);
});
