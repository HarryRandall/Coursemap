"use client";
import { cn } from "@/lib/cn";

export /**
 * Completed and planned amounts stacked against a target: completed solid,
 * planned striped in the same colour, so the two read as one scale. A cap is
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
    progress: "bg-success/70",
    limit: "bg-muted-foreground/50",
    over_limit: "bg-destructive",
  }[tone];
  const stripes = {
    progress: "text-success/60",
    limit: "text-muted-foreground/60",
    over_limit: "text-destructive/60",
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
        className={cn(
          "block h-full bg-transparent planned-stripes transition-[width]",
          stripes,
        )}
        style={{ width: `${plannedShare}%` }}
      />
    </div>
  );
}
