import type { Accent } from "@/lib/coursemap/types";
import type { EffectiveStatus } from "@/lib/planner";

/**
 * Accent colour system for course tokens, plan card rails and legends.
 * Mapped onto the stock Tailwind palette so everything stays cohesive.
 */
export const accent: Record<
  Accent,
  { token: string; bar: string; dot: string; ring: string }
> = {
  blue: {
    token: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    bar: "bg-sky-500",
    dot: "bg-sky-500",
    ring: "ring-sky-200 dark:ring-sky-900",
  },
  violet: {
    token:
      "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    bar: "bg-violet-500",
    dot: "bg-violet-500",
    ring: "ring-violet-200 dark:ring-violet-900",
  },
  mint: {
    token:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    ring: "ring-emerald-200 dark:ring-emerald-900",
  },
  amber: {
    token:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    ring: "ring-amber-200 dark:ring-amber-900",
  },
  rose: {
    token: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    ring: "ring-rose-200 dark:ring-rose-900",
  },
  cyan: {
    token: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
    bar: "bg-cyan-500",
    dot: "bg-cyan-500",
    ring: "ring-cyan-200 dark:ring-cyan-900",
  },
};

/** Visual tone shared by badges and status pills. */
export type Tone =
  "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export const statusTone: Record<EffectiveStatus, Tone> = {
  completed: "success",
  failed: "danger",
  planned: "info",
  enrolled: "info",
  withdrawn: "neutral",
  blocked: "warning",
  approval: "warning",
  review: "warning",
};

/** Map Coursemap statuses onto the standard ReUI badge variants. */
export const badgeVariantForTone = {
  neutral: "outline",
  brand: "primary-light",
  success: "success-light",
  warning: "warning-light",
  danger: "destructive-light",
  info: "info-light",
} as const;
