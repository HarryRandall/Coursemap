"use client";
import { cn } from "@/lib/cn";

export /**
 * Completed and planned amounts stacked against a target: completed in full
 * green, planned in a lighter tint of it, so the two read as one scale. A cap is
 * drawn in muted tones, since filling it is not something to work towards.
 */
function UnitsBar({
  completed,
  planned,
  goal,
  tone = "progress",
  className,
}: {
  completed: number;
  planned: number;
  goal: number | null;
  tone?: "progress" | "limit" | "over_limit";
  className?: string;
}) {
  if (goal === null || goal <= 0) return null;
  const completedShare = Math.min(100, (completed / goal) * 100);
  const plannedShare = Math.min(100 - completedShare, (planned / goal) * 100);
  const fill = {
    progress: "bg-success",
    limit: "bg-muted-foreground/50",
    over_limit: "bg-destructive",
  }[tone];
  const plannedFill = {
    progress: "bg-success/35",
    limit: "bg-muted-foreground/25",
    over_limit: "bg-destructive/40",
  }[tone];
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-1 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <span
        className={cn("block h-full transition-[width]", fill)}
        style={{ width: `${completedShare}%` }}
      />
      <span
        className={cn("block h-full transition-[width]", plannedFill)}
        style={{ width: `${plannedShare}%` }}
      />
    </div>
  );
}
