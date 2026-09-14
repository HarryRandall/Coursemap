import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Completed and planned progress as one ring — completed in the success tone,
 * planned continuing from where it ends, over a muted remainder.
 */
export function ProgressRing({
  completed,
  planned,
  target,
  children,
  size = "default",
}: {
  completed: number;
  planned: number;
  target: number;
  children: ReactNode;
  size?: "small" | "default" | "large";
}) {
  const done =
    target > 0 ? Math.min(100, Math.max(0, (completed / target) * 100)) : 0;
  const future =
    target > 0
      ? Math.min(100 - done, Math.max(0, (planned / target) * 100))
      : 0;
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center",
        size === "large" ? "size-28" : size === "small" ? "size-11" : "size-16",
      )}
    >
      <svg
        viewBox="0 0 64 64"
        className="absolute inset-0 size-full -rotate-90"
        aria-hidden="true"
        fill="none"
        strokeWidth="5"
      >
        <circle cx="32" cy="32" r="28" className="stroke-muted-foreground/30" />
        <circle
          cx="32"
          cy="32"
          r="28"
          pathLength="100"
          className="stroke-success"
          strokeDasharray={`${done} 100`}
        />
        <circle
          cx="32"
          cy="32"
          r="28"
          pathLength="100"
          className="stroke-primary"
          strokeDasharray={`${future} 100`}
          strokeDashoffset={-done}
        />
      </svg>
      <span
        className={cn(
          "font-semibold tabular-nums",
          size === "large"
            ? "text-2xl"
            : size === "small"
              ? "text-xs"
              : "text-sm",
        )}
      >
        {children}
      </span>
    </div>
  );
}
