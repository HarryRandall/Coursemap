import { expect, test } from "vitest";
import {
  extractWithOpenRouter,
  restoreOpenRouterExtraction,
} from "../lib/catalogue-import/openrouter.ts";
import {
  extractionUsageForStorage,
  summariseExtractionCosts,
} from "../lib/catalogue-sync/extraction-usage.ts";

test("missing provider usage stays unknown through audit restoration and storage", async () => {
  const result = await extractWithOpenRouter({
    model: "google/gemini-3.1-flash-lite",
    systemPrompt: "Return a course.",
    modelInput: "COMP1100",
    schema: { type: "object" },
    env: { NODE_ENV: "test", OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async () =>
      Response.json({
        choices: [{ finish_reason: "error", message: { content: '{"code":' } }],
      }),
  });
  const restored = restoreOpenRouterExtraction(
    result.responseForAudit,
    result.requestedModel,
  );
  expect(extractionUsageForStorage(restored.usage, false)).toEqual({
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    costUsd: null,
    costSource: "unknown",
  });
  expect(extractionUsageForStorage(restored.usage, true)).toMatchObject({
    inputTokens: null,
    costUsd: 0,
    costSource: "cache",
  });
});

test("measured zero and missing cost produce different totals", () => {
  expect(
    summariseExtractionCosts([
      { costUsd: 0, costSource: "provider" },
      { costUsd: 0, costSource: "cache" },
    ]),
  ).toEqual({ costUsd: 0, knownCostUsd: 0 });
  expect(
    summariseExtractionCosts([
      { costUsd: 0.02, costSource: "provider" },
      { costUsd: 0, costSource: "unknown" },
      { costUsd: null, costSource: "unknown" },
    ]),
  ).toEqual({ costUsd: null, knownCostUsd: 0.02 });
});

test("invalid provider costs are unavailable rather than negative expenditure", async () => {
  const result = await extractWithOpenRouter({
    model: "google/gemini-3.1-flash-lite",
    systemPrompt: "Return a course.",
    modelInput: "COMP1100",
    schema: { type: "object" },
    env: { NODE_ENV: "test", OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async () =>
      Response.json({
        choices: [{ finish_reason: "stop", message: { content: "{}" } }],
        usage: { cost: -1, prompt_tokens: 0, completion_tokens: 0 },
      }),
  });
  expect(extractionUsageForStorage(result.usage, false)).toMatchObject({
    inputTokens: 0,
    outputTokens: 0,
    costUsd: null,
    costSource: "unknown",
  });
});
