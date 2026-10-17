// Groups pending agent requests into batches a subagent can answer in one
// pass, then validates the answers and saves them under each request's key.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_BATCH_SIZE = 40;

/** The request input without its year, so identical wording across years is answered once. */
export function deduplicationKey(request) {
  let input = request.modelInput;
  try {
    const parsed = JSON.parse(request.modelInput);
    delete parsed.year;
    input = JSON.stringify(parsed);
  } catch {
    // Full-page programme prompts are plain text; only exact repeats merge.
  }
  return JSON.stringify([request.schemaName, request.systemPrompt, input]);
}

async function readJsonFiles(directory) {
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map(async (name) =>
        JSON.parse(await readFile(join(directory, name), "utf8")),
      ),
  );
}

export async function readPendingRequests(root) {
  const answered = new Set(
    (await readdir(join(root, "answers")).catch(() => [])).map((name) =>
      name.replace(/\.json$/, ""),
    ),
  );
  return (await readJsonFiles(join(root, "requests"))).filter(
    (request) => !answered.has(request.key),
  );
}

/**
 * Writes one batch file per group of distinct requests. Each item lists every
 * request key that shares its wording, so one answer covers all of them.
 */
export async function prepareBatches(
  root,
  { size = DEFAULT_BATCH_SIZE, schemaName = null } = {},
) {
  const groups = new Map();
  for (const request of await readPendingRequests(root)) {
    if (schemaName && request.schemaName !== schemaName) continue;
    const key = deduplicationKey(request);
    const group = groups.get(key);
    if (group) {
      group.keys.push(request.key);
      group.records.push(
        `${request.kind}:${request.code}:${request.academicYear}`,
      );
    } else {
      groups.set(key, {
        request,
        keys: [request.key],
        records: [`${request.kind}:${request.code}:${request.academicYear}`],
      });
    }
  }
  const bySchema = new Map();
  for (const group of groups.values()) {
    const list = bySchema.get(group.request.schemaName) ?? [];
    list.push(group);
    bySchema.set(group.request.schemaName, list);
  }
  const directory = join(root, "batches");
  await mkdir(directory, { recursive: true });
  const existing = new Set(await readdir(directory));
  const written = [];
  for (const [name, list] of bySchema) {
    for (let start = 0; start < list.length; start += size) {
      const items = list.slice(start, start + size);
      let number = 1;
      while (existing.has(`${name}-${String(number).padStart(4, "0")}.json`))
        number += 1;
      const file = `${name}-${String(number).padStart(4, "0")}.json`;
      existing.add(file);
      const first = items[0].request;
      await writeFile(
        join(directory, file),
        `${JSON.stringify(
          {
            schemaName: name,
            instructions: first.systemPrompt,
            schema: first.schema,
            items: items.map((group, index) => ({
              id: String(index + 1),
              keys: group.keys,
              records: group.records,
              input: (() => {
                try {
                  return JSON.parse(group.request.modelInput);
                } catch {
                  return group.request.modelInput;
                }
              })(),
            })),
          },
          null,
          2,
        )}\n`,
      );
      written.push({ file, items: items.length });
    }
  }
  return written;
}

/**
 * Saves answers from `<batch>.answers.json` ({ "<item id>": answer }) that an
 * independent check approved in `<batch>.verdicts.json`
 * ({ "<item id>": { approve, reason } }) and the import adapter accepts.
 * Everything else is reported and left unsaved, so the next `prepare` offers
 * it again.
 */
export async function applyBatchAnswers(root, batchFile, { validate }) {
  const batch = JSON.parse(
    await readFile(join(root, "batches", batchFile), "utf8"),
  );
  const sibling = async (suffix) =>
    JSON.parse(
      await readFile(
        join(root, "batches", batchFile.replace(/\.json$/, suffix)),
        "utf8",
      ),
    );
  const answers = await sibling(".answers.json");
  const verdicts = await sibling(".verdicts.json");
  await mkdir(join(root, "answers"), { recursive: true });
  const result = { saved: 0, invalid: [], rejected: [], missing: [] };
  for (const item of batch.items) {
    const answer = answers[item.id];
    if (answer === undefined) {
      result.missing.push(item.id);
      continue;
    }
    const verdict = verdicts[item.id];
    if (verdict?.approve !== true) {
      result.rejected.push({
        id: item.id,
        record: item.records[0],
        reason: verdict?.reason ?? "No independent verdict.",
      });
      continue;
    }
    const [kind, code, year] = item.records[0].split(":");
    const issues = validate({
      kind,
      code,
      academicYear: Number(year),
      schemaName: batch.schemaName,
      answer,
    });
    if (issues.length) {
      result.invalid.push({ id: item.id, record: item.records[0], issues });
      continue;
    }
    for (const key of item.keys) {
      await writeFile(
        join(root, "answers", `${key}.json`),
        `${JSON.stringify(answer)}\n`,
      );
      result.saved += 1;
    }
  }
  return result;
}

/**
 * Carries saved answers over to regenerated requests. After a prompt or
 * schema change, each record's new request gets the answer its previous
 * request had, when the import adapter still accepts it; answers that no
 * longer validate stay behind for a fresh batch.
 */
export async function rekeyAnswers(root, previousRequests, { validate }) {
  const record = (request) =>
    `${request.schemaName}:${request.kind}:${request.code}:${request.academicYear}`;
  const previous = new Map();
  for (const request of await readJsonFiles(previousRequests))
    previous.set(record(request), request.key);
  const result = { rekeyed: 0, invalid: [], unmatched: 0 };
  for (const request of await readPendingRequests(root)) {
    const oldKey = previous.get(record(request));
    let answer;
    try {
      answer = JSON.parse(
        await readFile(join(root, "answers", `${oldKey}.json`), "utf8"),
      );
    } catch {
      result.unmatched += 1;
      continue;
    }
    const issues = validate({
      kind: request.kind,
      code: request.code,
      academicYear: request.academicYear,
      schemaName: request.schemaName,
      answer,
    });
    if (issues.length) {
      result.invalid.push({ record: record(request), issues });
      continue;
    }
    await writeFile(
      join(root, "answers", `${request.key}.json`),
      `${JSON.stringify(answer)}\n`,
    );
    result.rekeyed += 1;
  }
  return result;
}
