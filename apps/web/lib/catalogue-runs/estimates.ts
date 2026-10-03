import { courseRunAllowance } from "./budget";

/** The fallback is one measured FINM2001 compact request, not a catalogue quote. */
export function courseRunEstimate({
  count,
  model,
  inputPrice,
  outputPrice,
  sampleCount,
  averageCost,
}: {
  count: number;
  model: string;
  inputPrice: number;
  outputPrice: number;
  sampleCount: number;
  averageCost: number | null;
}) {
  const measured = sampleCount >= 5 && averageCost !== null;
  const fallback = model === "google/gemini-3.1-flash-lite";
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
    maximumUsd: courseRunAllowance(inputPrice, outputPrice) * count,
    estimateBasis: measured
      ? `Based on ${sampleCount} completed imports at these model prices.`
      : fallback
        ? "Provisional estimate from one measured complex course. Simple courses may cost less."
        : "No measured estimate is available for this model yet.",
  };
}
