import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import {
  AGENT_IMPORT_MODEL,
  AgentAnswerPendingError,
  agentRequestKey,
  extractWithAgentAnswers,
} from "../lib/catalogue-import/agent-extraction.ts";
import {
  applyBatchAnswers,
  deduplicationKey,
  prepareBatches,
  rekeyAnswers,
} from "../scripts/catalogue/lib/agent-batches.mjs";
import {
  forEachConcurrently,
  parseYearImportArgs,
} from "../scripts/catalogue/lib/year-import.mjs";

const REQUEST = {
  systemPrompt: "Interpret only the supplied ANU eligibility text.",
  schemaName: "course_requisites",
  schema: { type: "object" },
  metadata: { kind: "course", code: "COMP2100", academicYear: 2026 },
};

function courseInput(year, requisiteText = "Completed COMP1110.") {
  return JSON.stringify({ code: "COMP2100", year, requisiteText });
}

test("a missing agent answer saves the request and fails without a paid outcome", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-answers-"));
  const modelInput = courseInput(2026);

  await assert.rejects(
    extractWithAgentAnswers({ ...REQUEST, modelInput, directory }),
    (error) =>
      error instanceof AgentAnswerPendingError &&
      error.code === "AGENT_ANSWER_PENDING" &&
      error.retryable === false,
  );

  const key = agentRequestKey({ ...REQUEST, modelInput });
  const saved = JSON.parse(
    await readFile(join(directory, "requests", `${key}.json`), "utf8"),
  );
  assert.equal(saved.code, "COMP2100");
  assert.equal(saved.modelInput, modelInput);
});

test("a saved agent answer returns a free extraction for the same request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-answers-"));
  const modelInput = courseInput(2026);
  const key = agentRequestKey({ ...REQUEST, modelInput });
  const answer = { requisites: { prerequisiteText: "Completed COMP1110." } };
  await mkdir(join(directory, "answers"));
  await writeFile(
    join(directory, "answers", `${key}.json`),
    JSON.stringify(answer),
  );

  const result = await extractWithAgentAnswers({
    ...REQUEST,
    modelInput,
    directory,
  });

  assert.deepEqual(result.parsed, answer);
  assert.equal(result.requestedModel, AGENT_IMPORT_MODEL);
  assert.equal(result.usage.costUsd, 0);
});

test("batches answer identical wording once across years and save it for each request", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-batches-"));
  await mkdir(join(root, "requests"));
  const requests = [2025, 2026].map((year) => {
    const modelInput = courseInput(year);
    return {
      key: agentRequestKey({ ...REQUEST, modelInput }),
      ...REQUEST.metadata,
      academicYear: year,
      schemaName: REQUEST.schemaName,
      schema: REQUEST.schema,
      systemPrompt: REQUEST.systemPrompt,
      modelInput,
    };
  });
  for (const request of requests)
    await writeFile(
      join(root, "requests", `${request.key}.json`),
      JSON.stringify(request),
    );
  assert.equal(deduplicationKey(requests[0]), deduplicationKey(requests[1]));

  const written = await prepareBatches(root, { size: 10 });
  assert.deepEqual(written, [
    { file: "course_requisites-0001.json", items: 1 },
  ]);

  await writeFile(
    join(root, "batches", "course_requisites-0001.answers.json"),
    JSON.stringify({ 1: { requisites: {} } }),
  );
  await writeFile(
    join(root, "batches", "course_requisites-0001.verdicts.json"),
    JSON.stringify({ 1: { approve: true } }),
  );
  const result = await applyBatchAnswers(root, "course_requisites-0001.json", {
    validate: () => [],
  });

  assert.equal(result.saved, 2);
  assert.deepEqual(
    (await readdir(join(root, "answers"))).sort(),
    requests.map((request) => `${request.key}.json`).sort(),
  );
});

test("invalid batch answers are reported and never saved", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-batches-"));
  await mkdir(join(root, "batches"), { recursive: true });
  await writeFile(
    join(root, "batches", "course_requisites-0001.json"),
    JSON.stringify({
      schemaName: "course_requisites",
      items: [{ id: "1", keys: ["abc"], records: ["course:COMP2100:2026"] }],
    }),
  );
  await writeFile(
    join(root, "batches", "course_requisites-0001.answers.json"),
    JSON.stringify({ 1: { requisites: null } }),
  );
  await writeFile(
    join(root, "batches", "course_requisites-0001.verdicts.json"),
    JSON.stringify({ 1: { approve: true } }),
  );

  const result = await applyBatchAnswers(root, "course_requisites-0001.json", {
    validate: () => ["requisites: Expected object"],
  });

  assert.equal(result.saved, 0);
  assert.deepEqual(result.invalid, [
    {
      id: "1",
      record: "course:COMP2100:2026",
      issues: ["requisites: Expected object"],
    },
  ]);
});

test("answers without an approving independent verdict are never saved", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-batches-"));
  await mkdir(join(root, "batches"), { recursive: true });
  await writeFile(
    join(root, "batches", "course_requisites-0001.json"),
    JSON.stringify({
      schemaName: "course_requisites",
      items: [
        { id: "1", keys: ["a"], records: ["course:COMP2100:2026"] },
        { id: "2", keys: ["b"], records: ["course:COMP3600:2026"] },
      ],
    }),
  );
  await writeFile(
    join(root, "batches", "course_requisites-0001.answers.json"),
    JSON.stringify({ 1: { requisites: {} }, 2: { requisites: {} } }),
  );
  await writeFile(
    join(root, "batches", "course_requisites-0001.verdicts.json"),
    JSON.stringify({ 1: { approve: false, reason: "Drops the AND scope." } }),
  );

  const result = await applyBatchAnswers(root, "course_requisites-0001.json", {
    validate: () => [],
  });

  assert.equal(result.saved, 0);
  assert.deepEqual(result.rejected, [
    { id: "1", record: "course:COMP2100:2026", reason: "Drops the AND scope." },
    {
      id: "2",
      record: "course:COMP3600:2026",
      reason: "No independent verdict.",
    },
  ]);
});

test("year import options require a supported year and known kinds", () => {
  assert.deepEqual(
    parseYearImportArgs([
      "--year",
      "2026",
      "--kinds",
      "programme,course",
      "--codes",
      "comp1100, math1013",
      "--skip-directory",
      "--refresh",
    ]),
    {
      year: 2026,
      kinds: ["course", "programme"],
      codes: ["COMP1100", "MATH1013"],
      limit: null,
      careers: null,
      concurrency: 6,
      skipDirectory: true,
      reimportHeld: false,
      refresh: true,
      answers: null,
    },
  );
  assert.throws(() => parseYearImportArgs(["--year", "2019"]), /2020 to 2030/);
  assert.throws(
    () => parseYearImportArgs(["--year", "2026", "--kinds", "degree"]),
    /Unknown kind/,
  );
  assert.throws(() => parseYearImportArgs([]), /--year is required/);
});

test("concurrent work never exceeds its limit and visits every item", async () => {
  let active = 0;
  let peak = 0;
  const seen = [];
  await forEachConcurrently([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    seen.push(item);
    active -= 1;
  });
  assert.equal(peak, 2);
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5]);
});

test("rekeying gives a regenerated request its record's previous answer", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-rekey-"));
  const previous = join(root, "requests-previous");
  await mkdir(previous);
  await mkdir(join(root, "requests"));
  await mkdir(join(root, "answers"));
  const request = (key) => ({
    key,
    kind: "course",
    code: "COMP2100",
    academicYear: 2026,
    schemaName: "course_requisites",
  });
  await writeFile(join(previous, "old.json"), JSON.stringify(request("old")));
  await writeFile(
    join(root, "requests", "new.json"),
    JSON.stringify(request("new")),
  );
  await writeFile(
    join(root, "answers", "old.json"),
    JSON.stringify({ requisites: {} }),
  );

  const result = await rekeyAnswers(root, previous, { validate: () => [] });

  assert.deepEqual(result, { rekeyed: 1, invalid: [], unmatched: 0 });
  assert.deepEqual(
    JSON.parse(await readFile(join(root, "answers", "new.json"), "utf8")),
    { requisites: {} },
  );
});
