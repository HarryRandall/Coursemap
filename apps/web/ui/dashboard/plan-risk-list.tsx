"use client";

import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@coursemap/ui/components/alert";
import { CircleAlert, Info } from "lucide-react";

import type { PlanRisk } from "@/lib/coursemap/plan-risks";

/** Outstanding decisions in the plan, worst first. */
export function PlanRiskList({ risks }: { risks: readonly PlanRisk[] }) {
  if (risks.length === 0)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing outstanding — every requirement is on track and no course is
        blocked.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      {risks.map((risk) => (
        <Alert
          key={risk.id}
          variant={risk.severity === "warning" ? "warning" : "info"}
        >
          {risk.severity === "warning" ? (
            <CircleAlert className="size-4" aria-hidden="true" />
          ) : (
            <Info className="size-4" aria-hidden="true" />
          )}
          <AlertTitle>{risk.title}</AlertTitle>
          <AlertDescription>{risk.detail}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
