import {
  OpenRouterConfigurationError,
  OpenRouterRequestError,
} from "../catalogue-import/openrouter.ts";

export type CatalogueProviderPauseReason =
  "key_limit" | "credits" | "authentication" | "configuration";

export type CatalogueProviderPause = {
  reason: CatalogueProviderPauseReason;
  message: string;
};

export class CatalogueProviderPausedError extends Error {
  readonly pause: CatalogueProviderPause;
  constructor(pause: CatalogueProviderPause) {
    super(pause.message);
    this.name = "CatalogueProviderPausedError";
    this.pause = pause;
  }
}

/** A provider-specific rejection must not stop unrelated OpenRouter routes. */
export function catalogueProviderPauseReason(
  error: unknown,
): CatalogueProviderPauseReason | null {
  if (error instanceof CatalogueProviderPausedError) return error.pause.reason;
  if (error instanceof OpenRouterConfigurationError)
    return /OPENROUTER_API_KEY/i.test(error.message) ? "configuration" : null;
  if (!(error instanceof OpenRouterRequestError) || error.providerName !== null)
    return null;
  if (/provider returned error/i.test(error.message)) return null;
  if (
    error.status === 403 &&
    /key limit exceeded\s*\((?:total|daily|weekly|monthly) limit\)/i.test(
      error.message,
    )
  )
    return "key_limit";
  if (
    error.status === 402 &&
    /insufficient credits|not enough credits|requires more credits|credit balance.*(?:exhausted|insufficient)/i.test(
      error.message,
    )
  )
    return "credits";
  if (
    error.status === 401 &&
    /invalid (?:api key|credentials)|missing (?:api key|authentication)|authentication (?:failed|required)/i.test(
      error.message,
    )
  )
    return "authentication";
  return null;
}
