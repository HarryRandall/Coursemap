import { Progress } from "@coursemap/ui/primitives/progress";

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
    <div className="space-y-2">
      <p className="flex items-baseline justify-between gap-3 text-xs font-medium text-muted-foreground">
        <span>
          Step {current} of {total}
        </span>
        <span>{label}</span>
      </p>
      <Progress
        aria-label={`Step ${current} of ${total}`}
        value={(current / total) * 100}
      />
    </div>
  );
}
