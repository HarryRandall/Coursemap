import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  CircleDashed,
  XCircle,
} from "lucide-react";
import type { CoursePlanStatus, EffectiveStatus } from "@/lib/planner";

export function StatusMark({
  status,
  flags,
  size = 15,
}: {
  status: EffectiveStatus;
  flags?: CoursePlanStatus;
  size?: number;
}) {
  if (flags?.lifecycle === "done" || status === "completed")
    return (
      <CheckCircle2
        size={size}
        aria-label="Completed"
        className="shrink-0 text-emerald-500"
      />
    );
  if (
    flags?.issues.some((issue) => issue.severity === "hard") ||
    (!flags && status === "blocked")
  )
    return (
      <Ban
        size={size}
        aria-label="Blocked"
        className="shrink-0 text-rose-500"
      />
    );
  if (
    flags?.issues.length ||
    (!flags && ["approval", "review", "unpublished"].includes(status))
  )
    return (
      <AlertTriangle
        size={size}
        aria-label="Review needed"
        className="shrink-0 text-amber-500"
      />
    );
  if (status === "failed")
    return (
      <XCircle
        size={size}
        aria-label="Failed"
        className="shrink-0 text-rose-500"
      />
    );
  if (status === "planned")
    return (
      <CircleDashed
        size={size}
        aria-label="Planned"
        className="shrink-0 text-primary"
      />
    );
  return (
    <Circle
      size={size}
      aria-label="Enrolled"
      className="shrink-0 text-primary"
    />
  );
}
