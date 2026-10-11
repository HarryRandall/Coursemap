"use client";
import { useState } from "react";
import { CalendarClock, ChevronDown } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { badgeVariantForTone } from "@/lib/ui";
import { canberraTodayIso } from "@/lib/canberra-format";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import type { Attempt } from "@/lib/coursemap/types";
import {
  offeringStanding,
  offeringTermId,
} from "@/lib/coursemap/offering-timeline";
import { OfferingRow } from "./offering-row";
import { OfferingYearStrip } from "./offering-year-strip";

/**
 * The offerings tab: the year at a glance, then each study period with where
 * it stands today. Periods that have finished fold away once there is
 * something still ahead.
 */
export function CourseOfferings({
  course,
  attempts,
  onAddToPeriod,
}: {
  course: Pick<CourseDetails, "code" | "offerings" | "offeringStatus" | "year">;
  attempts: readonly Attempt[];
  /** Plans the course in a planner term; absent in previews. */
  onAddToPeriod?: (termId: string) => void;
}) {
  const [showFinished, setShowFinished] = useState(false);
  const today = canberraTodayIso();
  const plannedTerms = new Set(
    attempts
      .filter(
        (attempt) =>
          attempt.courseCode === course.code &&
          (attempt.status === "planned" || attempt.status === "enrolled"),
      )
      .map((attempt) => attempt.termId),
  );
  const offerings = [...course.offerings].sort((left, right) =>
    (left.startsOn ?? "9999").localeCompare(right.startsOn ?? "9999"),
  );
  const finished = offerings.filter(
    (offering) => offeringStanding(offering, today).phase === "finished",
  );
  const ahead = offerings.filter((offering) => !finished.includes(offering));
  const folded = ahead.length > 0 && !showFinished ? finished : [];
  const shown = offerings.filter((offering) => !folded.includes(offering));
  const statusNote =
    course.offeringStatus === "not_offered"
      ? `Not offered in ${course.year}`
      : course.offeringStatus === "offered"
        ? null
        : "Offering unconfirmed";

  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle>
          <h2>{`Study periods in ${course.year}`}</h2>
        </CardTitle>
        <CardDescription>
          From ANU class information. Check the class summary before you enrol.
        </CardDescription>
        {statusNote ? (
          <Badge variant={badgeVariantForTone.warning} className="mt-2 w-fit">
            {statusNote}
          </Badge>
        ) : null}
      </CardHeader>
      {offerings.length ? (
        <CardContent className="border-t border-border/60 p-0 pt-4">
          <OfferingYearStrip
            offerings={offerings}
            today={today}
            year={course.year}
          />
          <div className="divide-y divide-border/60 border-t border-border/60">
            {shown.map((offering, index) => {
              const termId = offeringTermId(offering);
              return (
                <OfferingRow
                  key={`${offering.periodCode}:${offering.classNumber ?? index}`}
                  offering={offering}
                  today={today}
                  inPlan={termId !== null && plannedTerms.has(termId)}
                  onAdd={
                    termId && onAddToPeriod && plannedTerms.size === 0
                      ? () => onAddToPeriod(termId)
                      : undefined
                  }
                />
              );
            })}
            {folded.length ? (
              <button
                type="button"
                onClick={() => setShowFinished(true)}
                className="flex w-full items-center gap-1.5 px-5 py-3 text-left text-xs font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              >
                <ChevronDown size={14} aria-hidden="true" />
                {`Show ${folded.length} finished ${folded.length === 1 ? "period" : "periods"}`}
              </button>
            ) : null}
          </div>
        </CardContent>
      ) : (
        <CardContent className="border-t border-border/60 p-0">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarClock aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                No study periods are listed for this year.
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}
    </Card>
  );
}
