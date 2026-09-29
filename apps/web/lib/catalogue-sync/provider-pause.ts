import {
  OpenRouterConfigurationError,
  OpenRouterRequestError,
  type OpenRouterProviderError,
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
  return sharedAccountPauseReason(error.status, error.message);
}

/** Classify fresh accepted responses only; replay must not reapply an old pause. */
export function catalogueProviderResponsePause(
  error: OpenRouterProviderError | null | undefined,
): CatalogueProviderPause | null {
  if (
    !error?.message ||
    error.providerName !== null ||
    error.providerCode !== null ||
    /provider returned error/i.test(error.message)
  )
    return null;
  const reason = sharedAccountPauseReason(Number(error.code), error.message);
  return reason ? { reason, message: error.message } : null;
}

function sharedAccountPauseReason(
  status: number,
  message: string,
): CatalogueProviderPauseReason | null {
  if (
    status === 403 &&
    /key limit exceeded\s*\((?:total|daily|weekly|monthly) limit\)/i.test(
      message,
    )
  )
    return "key_limit";
  if (
    status === 402 &&
    /insufficient credits|not enough credits|requires more credits|credit balance.*(?:exhausted|insufficient)/i.test(
      message,
    )
  )
    return "credits";
  if (
    status === 401 &&
    /invalid (?:api key|credentials)|missing (?:api key|authentication)|authentication (?:failed|required)/i.test(
      message,
    )
  )
    return "authentication";
  return null;
}
