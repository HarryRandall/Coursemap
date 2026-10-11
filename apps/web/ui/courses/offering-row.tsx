import { CalendarCheck, Check, ExternalLink, MapPin, Plus } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { cn } from "@/lib/cn";
import { badgeVariantForTone } from "@/lib/ui";
import type { CourseOffering } from "@/lib/coursemap/course-types";
import {
  offeringMilestones,
  offeringShortName,
  offeringStanding,
  shortDate,
  type OfferingPhase,
} from "@/lib/coursemap/offering-timeline";

const toneForPhase: Record<OfferingPhase, keyof typeof badgeVariantForTone> = {
  upcoming: "neutral",
  closing: "warning",
  "enrolment-closed": "neutral",
  running: "success",
  finished: "neutral",
  unknown: "neutral",
};

/**
 * One study period: what it is, where it stands today and the dates a
 * student plans around, with a way to put the course in that period.
 */
export function OfferingRow({
  offering,
  today,
  inPlan,
  onAdd,
}: {
  offering: CourseOffering;
  today: string;
  /** The course is already planned in this period. */
  inPlan: boolean;
  /** Plans the course in this period; absent when it cannot be added. */
  onAdd?: () => void;
}) {
  const standing = offeringStanding(offering, today);
  const milestones = offeringMilestones(offering, today);
  const finished = standing.phase === "finished";
  const place = [offering.deliveryMode, offering.location].filter(Boolean);
  return (
    <section
      aria-label={offering.periodName}
      className={cn(
        "grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start",
        finished && "opacity-70",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {offering.periodName}
          </h3>
          {standing.label ? (
            <Badge variant={badgeVariantForTone[toneForPhase[standing.phase]]}>
              {standing.label}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {offering.classNumber ? (
            <span className="font-mono">Class {offering.classNumber}</span>
          ) : null}
          {place.map((item, index) => (
            <span key={item} className="inline-flex items-center gap-1">
              {offering.classNumber || index > 0 ? (
                <span aria-hidden="true">·</span>
              ) : null}
              {item === offering.location ? (
                <MapPin size={11} aria-hidden="true" />
              ) : null}
              {item}
            </span>
          ))}
        </p>
        {milestones.length ? (
          <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-6">
            {milestones.map((milestone) => (
              <li key={milestone.key} className="min-w-0">
                <p className="text-[11px] text-muted-foreground/80">
                  {milestone.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1 text-xs font-medium tabular-nums",
                    milestone.passed
                      ? "text-muted-foreground"
                      : "text-foreground/90",
                  )}
                >
                  {milestone.passed ? (
                    <Check size={11} aria-label="Passed" />
                  ) : null}
                  {shortDate(milestone.date)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Dates are not listed yet.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        {inPlan ? (
          <Badge variant={badgeVariantForTone.brand}>
            <CalendarCheck size={12} aria-hidden="true" />
            In your plan
          </Badge>
        ) : onAdd && !finished ? (
          <Button size="sm" variant="outline" type="button" onClick={onAdd}>
            <Plus size={14} aria-hidden="true" />
            {`Add to ${offeringShortName(offering)}`}
          </Button>
        ) : null}
        {offering.classSummaryUrl ? (
          <Button asChild size="icon" variant="ghost" className="size-8">
            <a
              href={offering.classSummaryUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`ANU class summary for ${offering.periodName}`}
              title="ANU class summary"
            >
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
