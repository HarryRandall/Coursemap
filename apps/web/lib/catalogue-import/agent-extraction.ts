import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  restoreOpenRouterExtraction,
  type OpenRouterExtraction,
} from "./openrouter.ts";

/** Runs requesting this model read answers written by a local agent instead of calling OpenRouter. */
export const AGENT_IMPORT_MODEL = "coursemap/agent";

export class AgentAnswerPendingError extends Error {
  readonly code = "AGENT_ANSWER_PENDING";
  readonly retryable = false;
  readonly requestKey: string;

  constructor(requestKey: string) {
    super(
      `No agent answer exists for request ${requestKey}. Answer it, then run the import again.`,
    );
    this.name = "AgentAnswerPendingError";
    this.requestKey = requestKey;
  }
}

export function isAgentImportModel(model: string) {
  return model === AGENT_IMPORT_MODEL;
}

/** Identifies a request by everything the answer depends on, so an identical request reuses its answer. */
export function agentRequestKey({
  systemPrompt,
  modelInput,
  schemaName,
}: {
  systemPrompt: string;
  modelInput: string;
  schemaName: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify([schemaName, systemPrompt, modelInput]))
    .digest("hex");
}

export function agentExtractionDirectory(env: NodeJS.ProcessEnv = process.env) {
  const directory = env.COURSEMAP_AGENT_EXTRACTION_DIR?.trim();
  if (!directory)
    throw new Error(
      "Set COURSEMAP_AGENT_EXTRACTION_DIR before importing with the agent model.",
    );
  return directory;
}

/**
 * Returns the saved answer for this request in the same shape as an OpenRouter
 * extraction. A missing answer saves the request under `requests/` and throws,
 * so the sync fails without a source version and can be imported again later.
 */
export async function extractWithAgentAnswers({
  systemPrompt,
  modelInput,
  schema,
  schemaName,
  metadata,
  directory = agentExtractionDirectory(),
}: {
  systemPrompt: string;
  modelInput: string;
  schema: unknown;
  schemaName: string;
  metadata: { kind: string; code: string; academicYear: number };
  directory?: string;
}): Promise<OpenRouterExtraction> {
  const key = agentRequestKey({ systemPrompt, modelInput, schemaName });
  let content: string;
  try {
    content = await readFile(
      path.join(directory, "answers", `${key}.json`),
      "utf8",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(path.join(directory, "requests"), { recursive: true });
    await writeFile(
      path.join(directory, "requests", `${key}.json`),
      `${JSON.stringify({ key, ...metadata, schemaName, schema, systemPrompt, modelInput }, null, 2)}\n`,
    );
    throw new AgentAnswerPendingError(key);
  }
  // Validates the answer is JSON before it reaches the adapter's schema checks.
  JSON.parse(content);
  return restoreOpenRouterExtraction(
    {
      id: null,
      model: AGENT_IMPORT_MODEL,
      content,
      finishReason: "stop",
      latencyMilliseconds: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        costUsd: 0,
      },
      extractionMethod: "agent",
      responseError: null,
    },
    AGENT_IMPORT_MODEL,
    schemaName,
  );
}
