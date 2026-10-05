import type { BulkImportKind } from "./kinds";
import { courseRunAllowance } from "./budget";

/** The fallback is one measured FINM2001 compact request, not a catalogue quote. */
export function courseRunEstimate({
  count,
  kind = "course",
  model,
  inputPrice,
  outputPrice,
  sampleCount,
  averageCost,
  allowAi = true,
}: {
  count: number;
  kind?: BulkImportKind;
  model: string;
  inputPrice: number;
  outputPrice: number;
  sampleCount: number;
  averageCost: number | null;
  allowAi?: boolean;
}) {
  if (!allowAi)
    return {
      minimumUsd: 0,
      estimateKind: "not_used" as const,
      estimatedUsd: 0,
      maximumUsd: 0,
      estimateBasis:
        "AI is disabled. Ambiguous requirements are retained for review.",
    };
  const measured = sampleCount >= 5 && averageCost !== null;
  const fallback =
    kind === "course" && model === "google/gemini-3.1-flash-lite";
  const perCourse = measured
    ? averageCost
    : fallback
      ? (3267 * inputPrice + 451 * outputPrice) / 1_000_000
      : null;
  return {
    minimumUsd: 0,
    estimateKind: measured
      ? "measured"
      : fallback
        ? "provisional"
        : "unavailable",
    estimatedUsd: perCourse === null ? null : perCourse * count,
    maximumUsd: courseRunAllowance(inputPrice, outputPrice, kind) * count,
    estimateBasis: measured
      ? `Based on ${sampleCount} completed imports at these model prices.`
      : fallback
        ? "Provisional estimate from one measured complex course. Simple courses may cost less."
        : "No measured estimate is available for this model yet.",
  };
}
