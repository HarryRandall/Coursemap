"use client";
import { cn } from "@/lib/cn";

export /**
 * Completed and planned amounts stacked against a target: completed in green
 * and planned in purple, as course statuses are everywhere else. A cap draws
 * its used units in red, since filling it is not something to work towards.
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
    limit: "bg-destructive/70",
    over_limit: "bg-destructive",
  }[tone];
  const plannedFill =
    tone === "over_limit" ? "bg-destructive/40" : "bg-primary";
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
