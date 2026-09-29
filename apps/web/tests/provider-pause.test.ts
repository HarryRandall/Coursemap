import { expect, test } from "vitest";
import {
  catalogueProviderPauseReason,
  catalogueProviderResponsePause,
} from "../lib/catalogue-sync/provider-pause.ts";
import {
  extractWithOpenRouter,
  OpenRouterRequestError,
  OpenRouterConfigurationError,
  type OpenRouterProviderError,
} from "../lib/catalogue-import/openrouter.ts";

test.each([
  [403, "Key limit exceeded (total limit).", "key_limit"],
  ["402", "Insufficient credits.", "credits"],
  [401, "Invalid API key.", "authentication"],
  [429, "Rate limit exceeded.", null],
  [503, "Unavailable.", null],
  [403, "Content blocked by guardrail.", null],
  [null, "Key limit exceeded (total limit).", null],
  [402, "Provider returned error: insufficient credits.", null],
])(
  "accepted response account classification: %s %s",
  (code, message, reason) => {
    const error = {
      code,
      message,
      providerName: null,
      providerCode: null,
      errorType: null,
    } as OpenRouterProviderError;
    expect(catalogueProviderResponsePause(error)?.reason ?? null).toBe(reason);
    for (const upstream of [
      { providerName: "Google" },
      { providerCode: "RESOURCE_EXHAUSTED" },
    ])
      expect(
        catalogueProviderResponsePause({ ...error, ...upstream }),
      ).toBeNull();
  },
);

test("only explicit shared provider failures pause imports", () => {
  expect(
    catalogueProviderPauseReason(
      new OpenRouterRequestError("Key limit exceeded (total limit).", 403),
    ),
  ).toBe("key_limit");
  expect(
    catalogueProviderPauseReason(
      new OpenRouterRequestError("This request requires more credits.", 402),
    ),
  ).toBe("credits");
  expect(
    catalogueProviderPauseReason(
      new OpenRouterRequestError("Invalid API key.", 401),
    ),
  ).toBe("authentication");
  expect(catalogueProviderPauseReason(new OpenRouterConfigurationError())).toBe(
    "configuration",
  );
  for (const error of [
    new OpenRouterRequestError("Content blocked by guardrail.", 403),
    new OpenRouterRequestError("Model not allowed.", 403),
    new OpenRouterRequestError(
      "Provider returned error. Provider detail: insufficient credits.",
      402,
    ),
    new OpenRouterRequestError(
      "Key limit exceeded (total limit).",
      403,
      "Upstream provider",
    ),
    new OpenRouterRequestError("Rate limit exceeded.", 429),
    new OpenRouterRequestError("Unavailable.", 503),
    new OpenRouterConfigurationError("Choose a valid model."),
  ])
    expect(catalogueProviderPauseReason(error)).toBeNull();
});

test("an upstream provider identity survives HTTP parsing and prevents a global pause", async () => {
  let caught: unknown;
  try {
    await extractWithOpenRouter({
      model: "google/gemini-3.1-flash-lite",
      systemPrompt: "Return a course.",
      modelInput: "COMP1100",
      schema: { type: "object" },
      env: { NODE_ENV: "test", OPENROUTER_API_KEY: "test-key" },
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              message: "Key limit exceeded (total limit).",
              metadata: { provider_name: "Upstream provider" },
            },
          },
          { status: 403 },
        ),
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(OpenRouterRequestError);
  expect((caught as OpenRouterRequestError).providerName).toBe(
    "Upstream provider",
  );
  expect(catalogueProviderPauseReason(caught)).toBeNull();
});

test("an HTTP 200 account error remains an auditable response and can pause imports", async () => {
  const result = await extractWithOpenRouter({
    model: "google/gemini-3.1-flash-lite",
    systemPrompt: "Return a course.",
    modelInput: "COMP1100",
    schema: { type: "object" },
    env: { NODE_ENV: "test", OPENROUTER_API_KEY: "test-key" },
    fetchImpl: async () =>
      Response.json({
        id: "accepted-failure",
        model: "google/gemini-3.1-flash-lite",
        error: { code: 402, message: "Insufficient credits." },
        usage: { prompt_tokens: 12, completion_tokens: 3, cost: 0.03 },
      }),
  });
  expect(result.generationId).toBe("accepted-failure");
  expect(result.usage.costUsd).toBe(0.03);
  expect(result.responseForAudit.providerError?.code).toBe(402);
  expect(result.responseError).toContain("Insufficient credits.");
  expect(catalogueProviderResponsePause(result.providerError)).toEqual({
    reason: "credits",
    message: "Insufficient credits.",
  });
});
