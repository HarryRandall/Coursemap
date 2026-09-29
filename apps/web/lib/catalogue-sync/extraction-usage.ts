import type { OpenRouterExtraction } from "../catalogue-import/openrouter.ts";

export function extractionUsageForStorage(
  usage: OpenRouterExtraction["usage"],
  reused: boolean,
) {
  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    costUsd: reused ? 0 : usage.costUsd,
    costSource: reused
      ? "cache"
      : usage.costUsd === null
        ? "unknown"
        : "provider",
  };
}

/** Older extractions stored unknown cost as zero; the source flag is decisive. */
export function reportedExtractionCost({
  costUsd,
  costSource,
}: {
  costUsd: number | null;
  costSource: string;
}): number | null {
  return costSource !== "unknown" &&
    costUsd !== null &&
    Number.isFinite(costUsd) &&
    costUsd >= 0
    ? costUsd
    : null;
}

export function summariseExtractionCosts(
  extractions: readonly { costUsd: number | null; costSource: string }[],
) {
  let knownCostUsd = 0;
  let complete = true;
  for (const extraction of extractions) {
    const cost = reportedExtractionCost(extraction);
    if (cost === null) complete = false;
    else knownCostUsd += cost;
  }
  return {
    costUsd: complete ? knownCostUsd : null,
    knownCostUsd,
  };
}
