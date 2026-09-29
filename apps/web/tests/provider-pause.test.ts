import { expect, test } from "vitest";
import { catalogueProviderPauseReason } from "../lib/catalogue-sync/provider-pause.ts";
import {
  extractWithOpenRouter,
  OpenRouterRequestError,
  OpenRouterConfigurationError,
} from "../lib/catalogue-import/openrouter.ts";

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
