import type { GradeCode } from "@/lib/academic/metrics";

/**
 * The dashboard palette. Colour does one job per chart:
 * - single-series figures use the brand colour;
 * - status uses success for completed and brand for planned or enrolled;
 * - grades keep one distinct colour each, matching the result chips.
 * Warnings keep amber and always come with words.
 */
export const brand = "var(--color-primary)";
export const success = "var(--color-success)";

/** One colour per grade band, shared by the grades chart and result chips. */
export const gradeColours: Record<GradeCode, string> = {
  N: "var(--color-muted-foreground)",
  P: "#fbbf24",
  CR: "#60a5fa",
  D: "#a78bfa",
  HD: "#34d399",
};
