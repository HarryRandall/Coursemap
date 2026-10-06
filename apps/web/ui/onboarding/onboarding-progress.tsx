import { cn } from "@/lib/cn";

/** One bar per step, filled up to the current one, with the step named beside it. */
export function OnboardingProgress({
  current,
  label,
  total,
}: {
  current: number;
  label: string;
  total: number;
}) {
  return (
    <div className="space-y-2.5">
      <div aria-hidden="true" className="flex gap-1">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
              index < current ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="flex items-baseline justify-between gap-3 text-xs font-medium text-muted-foreground">
        <span>
          Step {current} of {total}
        </span>
        <span>{label}</span>
      </p>
    </div>
  );
}
