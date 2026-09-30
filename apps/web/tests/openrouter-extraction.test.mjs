import assert from "node:assert/strict";
import { test } from "vitest";

import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_REQUEST_TIMEOUT_MS,
  OpenRouterConfigurationError,
  OpenRouterRequestError,
  assertOpenRouterModel,
  extractWithOpenRouter,
  restoreOpenRouterExtraction,
} from "../lib/catalogue-import/openrouter.ts";

const TEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["code"],
  properties: { code: { type: "string" } },
};

test("bounds each OpenRouter request within the queue delivery budget", () => {
  assert.equal(OPENROUTER_REQUEST_TIMEOUT_MS, 35_000);
});

test("validates saved model identifiers without an environment allow-list", () => {
  assert.equal(
    assertOpenRouterModel(" ANTHROPIC/CLAUDE-HAIKU-4.5 "),
    "anthropic/claude-haiku-4.5",
  );
  assert.throws(
    () => assertOpenRouterModel("invalid"),
    /identifier is invalid/,
  );
});

test("sends one schema-guided, low-cost extraction and strips model reasoning from audit data", async () => {
  let capturedRequest;
  const result = await extractWithOpenRouter({
    model: DEFAULT_OPENROUTER_MODEL,
    systemPrompt: "Return the course.",
    modelInput: "COMP1100",
    schema: TEST_SCHEMA,
    env: { OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async (_url, request) => {
      capturedRequest = request;
      return Response.json({
        id: "generation-1",
        model: DEFAULT_OPENROUTER_MODEL,
        created: 1_800_000_000,
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({ code: "COMP1100" }),
              reasoning: "must never be retained",
              reasoning_details: [{ type: "reasoning.text", text: "hidden" }],
            },
          },
        ],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
          cost: 0.00012,
          prompt_tokens_details: { cached_tokens: 20 },
          completion_tokens_details: { reasoning_tokens: 4 },
        },
        openrouter_metadata: {
          requested: DEFAULT_OPENROUTER_MODEL,
          strategy: "direct",
          region: "syd",
          summary: "available=2, selected=Google",
          attempt: 2,
          is_byok: false,
          endpoints: {
            available: [
              {
                provider: "Alternative provider",
                model: DEFAULT_OPENROUTER_MODEL,
                selected: false,
              },
              {
                provider: "Google",
                model: DEFAULT_OPENROUTER_MODEL,
                selected: true,
              },
            ],
          },
          attempts: [
            {
              provider: "Alternative provider",
              model: DEFAULT_OPENROUTER_MODEL,
              status: 503,
            },
            {
              provider: "Google",
              model: DEFAULT_OPENROUTER_MODEL,
              status: 200,
            },
          ],
        },
      });
    },
  });

  const requestBody = JSON.parse(capturedRequest.body);
  assert.equal(capturedRequest.headers["X-OpenRouter-Metadata"], "enabled");
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.temperature, 0);
  assert.deepEqual(requestBody.reasoning, {
    effort: "minimal",
    exclude: true,
  });
  assert.equal(requestBody.provider.require_parameters, true);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.equal(
    requestBody.messages[0].content,
    `Return the course.\n\nTrusted output contract (course_extraction). Return one JSON object matching this exact JSON Schema:\n${JSON.stringify(TEST_SCHEMA)}`,
  );
  assert.deepEqual(requestBody.messages[1], {
    role: "user",
    content: "COMP1100",
  });
  assert.deepEqual(result.parsed, { code: "COMP1100" });
  assert.deepEqual(result.usage, {
    inputTokens: 120,
    outputTokens: 30,
    totalTokens: 150,
    cachedInputTokens: 20,
    reasoningTokens: 4,
    costUsd: 0.00012,
  });
  assert.deepEqual(result.routerMetadata, {
    requested: DEFAULT_OPENROUTER_MODEL,
    strategy: "direct",
    region: "syd",
    summary: "available=2, selected=Google",
    attempt: 2,
    isByok: false,
    selectedProvider: "Google",
    attempts: [
      {
        provider: "Alternative provider",
        model: DEFAULT_OPENROUTER_MODEL,
        status: 503,
      },
      {
        provider: "Google",
        model: DEFAULT_OPENROUTER_MODEL,
        status: 200,
      },
    ],
  });
  assert.equal("reasoning" in result.responseForAudit, false);
  assert.equal(
    JSON.stringify(result.responseForAudit).includes("hidden"),
    false,
  );

  const restored = restoreOpenRouterExtraction(
    result.responseForAudit,
    DEFAULT_OPENROUTER_MODEL,
  );
  assert.deepEqual(restored.parsed, { code: "COMP1100" });
  assert.deepEqual(restored.usage, result.usage);
  assert.equal(restored.generationId, "generation-1");
  assert.deepEqual(restored.routerMetadata, result.routerMetadata);
});

test("recovers one redundant requirement brace while retaining the original paid response", async () => {
  const expected = {
    kind: "major",
    requirements: {
      rule: { type: "group", children: [{ type: "condition" }] },
      unmodelledText: [],
    },
    evidence: [],
  };
  const original = JSON.stringify(expected).replace(
    '}]},"unmodelledText":',
    '}]}},"unmodelledText":',
  );
  assert.notEqual(original, JSON.stringify(expected));
  assert.throws(() => JSON.parse(original));

  const result = await extractWithOpenRouter({
    model: DEFAULT_OPENROUTER_MODEL,
    systemPrompt: "Return the structure.",
    modelInput: "ACMK-MAJ",
    schema: TEST_SCHEMA,
    schemaName: "academic_structure_extraction",
    env: { OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async () =>
      Response.json({
        model: DEFAULT_OPENROUTER_MODEL,
        choices: [{ finish_reason: "stop", message: { content: original } }],
      }),
  });
  assert.deepEqual(result.parsed, expected);
  assert.equal(result.responseError, null);
  assert.equal(result.responseRepair, "extra_requirement_closing_brace");
  assert.equal(result.responseForAudit.content, original);

  const restored = restoreOpenRouterExtraction(
    {
      ...result.responseForAudit,
      responseError:
        "OpenRouter returned invalid JSON despite structured-output mode.",
    },
    DEFAULT_OPENROUTER_MODEL,
    "academic_structure_extraction",
  );
  assert.deepEqual(restored.parsed, expected);
  assert.equal(restored.responseError, null);
  assert.equal(restored.responseRepair, "extra_requirement_closing_brace");
  assert.equal(restored.responseForAudit.content, original);

  const courseRestoration = restoreOpenRouterExtraction(
    result.responseForAudit,
    DEFAULT_OPENROUTER_MODEL,
  );
  assert.equal(courseRestoration.parsed, null);
  assert.match(courseRestoration.responseError, /invalid JSON/);
  assert.equal(courseRestoration.responseRepair, null);
});

test("never starts an extraction without the dedicated key", async () => {
  await assert.rejects(
    extractWithOpenRouter({
      model: DEFAULT_OPENROUTER_MODEL,
      systemPrompt: "Return the course.",
      modelInput: "COMP1100",
      schema: TEST_SCHEMA,
      env: {},
    }),
    OpenRouterConfigurationError,
  );
});

test("preserves a paid malformed response for validation and retry reuse", async () => {
  const result = await extractWithOpenRouter({
    model: DEFAULT_OPENROUTER_MODEL,
    systemPrompt: "Return the course.",
    modelInput: "COMP1100",
    schema: TEST_SCHEMA,
    env: { OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async () =>
      Response.json({
        id: "generation-malformed",
        model: DEFAULT_OPENROUTER_MODEL,
        choices: [{ finish_reason: "stop", message: { content: "not json" } }],
        usage: { prompt_tokens: 5, completion_tokens: 2, cost: 0.00001 },
      }),
  });

  assert.equal(result.parsed, null);
  assert.match(result.responseError, /invalid JSON/);
  const restored = restoreOpenRouterExtraction(
    result.responseForAudit,
    DEFAULT_OPENROUTER_MODEL,
  );
  assert.equal(restored.parsed, null);
  assert.equal(restored.responseError, result.responseError);
  assert.equal(restored.usage.costUsd, 0.00001);
});

test("preserves a successful non-JSON provider response for audit", async () => {
  const result = await extractWithOpenRouter({
    model: DEFAULT_OPENROUTER_MODEL,
    systemPrompt: "Return the course.",
    modelInput: "COMP1100",
    schema: TEST_SCHEMA,
    env: { OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async () =>
      new Response("provider returned an unexpected body", { status: 200 }),
  });

  assert.equal(result.parsed, null);
  assert.match(result.responseError, /non-JSON/);
  assert.equal(
    result.responseForAudit.rawResponseText,
    "provider returned an unexpected body",
  );
  const restored = restoreOpenRouterExtraction(
    result.responseForAudit,
    DEFAULT_OPENROUTER_MODEL,
  );
  assert.equal(restored.responseError, result.responseError);
});

for (const location of ["envelope", "choice"]) {
  test(`preserves interrupted provider output and error metadata from the ${location}`, async () => {
    let requests = 0;
    const error = {
      code: 429,
      message: `Provider rate limit\n${"x".repeat(500)}`,
      metadata: {
        error_type: "rate_limit_exceeded",
        provider_code: "RESOURCE_EXHAUSTED",
        provider_name: "Google",
        raw: "hidden raw provider payload",
        reasoning: "hidden reasoning",
      },
    };
    const result = await extractWithOpenRouter({
      model: DEFAULT_OPENROUTER_MODEL,
      systemPrompt: "Return the course.",
      modelInput: "COMP1100",
      schema: TEST_SCHEMA,
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl: async () => {
        requests += 1;
        return Response.json({
          id: "generation-interrupted",
          ...(location === "envelope" ? { error } : {}),
          choices: [
            {
              finish_reason: "error",
              native_finish_reason: "RESOURCE_EXHAUSTED",
              ...(location === "choice" ? { error } : {}),
              message: { content: '{"code":' },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 2, cost: 0.00001 },
        });
      },
    });
    assert.equal(requests, 1);
    assert.equal(result.content, '{"code":');
    assert.equal(result.parsed, null);
    assert.equal(result.nativeFinishReason, "RESOURCE_EXHAUSTED");
    assert.equal(result.providerError.code, 429);
    assert.equal(result.providerError.errorType, "rate_limit_exceeded");
    assert.equal(result.providerError.providerCode, "RESOURCE_EXHAUSTED");
    assert.equal(result.providerError.providerName, "Google");
    assert.equal(result.providerError.message.length, 400);
    assert.doesNotMatch(result.responseError, /invalid JSON/);
    assert.match(result.responseError, /provider failed.*429.*rate limit/);
    assert.doesNotMatch(JSON.stringify(result.responseForAudit), /hidden/);
    const restored = restoreOpenRouterExtraction(
      result.responseForAudit,
      DEFAULT_OPENROUTER_MODEL,
    );
    assert.equal(restored.responseError, result.responseError);
    assert.deepEqual(restored.providerError, result.providerError);
    assert.equal(restored.nativeFinishReason, result.nativeFinishReason);
    assert.deepEqual(restored.usage, result.usage);
  });
}

test("preserves an HTTP 200 error envelope without choices as an audited model outcome", async () => {
  const result = await extractWithOpenRouter({
    model: DEFAULT_OPENROUTER_MODEL,
    systemPrompt: "Return the course.",
    modelInput: "COMP1100",
    schema: TEST_SCHEMA,
    env: { OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async () =>
      Response.json({
        id: "generation-failed",
        error: { code: 502, message: "Provider disconnected" },
      }),
  });
  assert.equal(result.generationId, "generation-failed");
  assert.equal(result.content, null);
  assert.equal(result.usage.costUsd, null);
  assert.match(result.responseError, /provider failed.*502.*disconnected/);
  const restored = restoreOpenRouterExtraction(
    result.responseForAudit,
    DEFAULT_OPENROUTER_MODEL,
  );
  assert.equal(restored.responseError, result.responseError);
});

test("flags parseable interrupted output and restores legacy interrupted audits as failures", async () => {
  const result = await extractWithOpenRouter({
    model: DEFAULT_OPENROUTER_MODEL,
    systemPrompt: "Return the course.",
    modelInput: "COMP1100",
    schema: TEST_SCHEMA,
    env: { OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async () =>
      Response.json({
        choices: [
          {
            finish_reason: "error",
            message: { content: '{"code":"COMP1100"}' },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2, cost: 0.00001 },
      }),
  });
  assert.deepEqual(result.parsed, { code: "COMP1100" });
  assert.match(result.responseError, /provider failed before finishing/);
  const legacyAudit = { ...result.responseForAudit, responseError: null };
  delete legacyAudit.providerError;
  delete legacyAudit.nativeFinishReason;
  const restored = restoreOpenRouterExtraction(
    legacyAudit,
    DEFAULT_OPENROUTER_MODEL,
  );
  assert.match(restored.responseError, /provider failed before finishing/);
  assert.equal(restored.responseForAudit.responseError, restored.responseError);
  assert.equal(restored.usage.costUsd, 0.00001);
});

test("classifies temporary provider failures at the request boundary", async () => {
  await assert.rejects(
    extractWithOpenRouter({
      model: DEFAULT_OPENROUTER_MODEL,
      systemPrompt: "Return the course.",
      modelInput: "COMP1100",
      schema: TEST_SCHEMA,
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl: async () =>
        Response.json(
          { error: { message: "provider unavailable" } },
          { status: 503 },
        ),
    }),
    (error) => {
      assert.ok(error instanceof OpenRouterRequestError);
      assert.equal(error.status, 503);
      assert.equal(error.retryable, true);
      assert.doesNotMatch(error.message, /test-key/);
      return true;
    },
  );
});

test("preserves bounded single-line provider detail for definitive failures", async () => {
  const rawDetail = `Schema rejected:\n${"x".repeat(600)}`;
  await assert.rejects(
    extractWithOpenRouter({
      model: DEFAULT_OPENROUTER_MODEL,
      systemPrompt: "Return the course.",
      modelInput: "COMP1100",
      schema: TEST_SCHEMA,
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              message: "Invalid request.",
              metadata: { raw: rawDetail },
            },
          },
          { status: 400 },
        ),
    }),
    (error) => {
      assert.ok(error instanceof OpenRouterRequestError);
      assert.equal(error.status, 400);
      assert.doesNotMatch(error.message, /[\r\n]/);
      const providerDetail = error.message.split(" Provider detail: ")[1];
      assert.equal(providerDetail.length, 400);
      assert.match(providerDetail, /^Schema rejected: x+/);
      assert.ok(providerDetail.endsWith("..."));
      return true;
    },
  );
});

test("a course request can spend more reasoning while retaining hidden-reasoning exclusion", async () => {
  let sent;
  await extractWithOpenRouter({
    model: DEFAULT_OPENROUTER_MODEL,
    systemPrompt: "Read the course.",
    modelInput: "Source.",
    schema: TEST_SCHEMA,
    reasoningEffort: "low",
    env: { NODE_ENV: "test", OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"code":"COMP1100"}' },
          },
        ],
      });
    },
  });
  assert.deepEqual(sent.reasoning, { effort: "low", exclude: true });
  assert.equal(sent.max_tokens, 12000);
});
