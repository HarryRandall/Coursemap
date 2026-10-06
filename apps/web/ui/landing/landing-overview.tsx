import type { CSSProperties, ReactNode } from "react";
import { AverageMarkMetric } from "@/ui/dashboard/average-mark-metric";
import { DegreeProgressHero } from "@/ui/dashboard/degree-progress-hero";
import { GpaMetric } from "@/ui/dashboard/gpa-metric";
import { GradesMetric } from "@/ui/dashboard/grades-metric";
import {
  overviewEnrolledUnits,
  overviewGpa,
  overviewGrades,
  overviewProgress,
  overviewTerms,
  overviewUnitTarget,
} from "@/ui/landing/landing-overview-data";

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

/**
 * The dashboard's own cards for an example student, with the university's
 * live key dates in the slot beside them. Sits inside an entered ancestor so the cards' entrance
 * animations play.
 */
export function LandingOverview({
  keyDates,
}: {
  /** The live key dates card, streamed in separately. */
  keyDates: ReactNode;
}) {
  return (
    <section
      aria-label="Example dashboard"
      className="rounded-lg border border-border bg-background p-3 shadow-sm sm:p-4"
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <GpaMetric gpa={overviewGpa} points={overviewTerms} />
          <GradesMetric grades={overviewGrades} />
          <AverageMarkMetric points={overviewTerms} />
          {keyDates}
        </div>
        <div style={delay(70)}>
          <DegreeProgressHero
            progress={overviewProgress}
            unitTarget={overviewUnitTarget}
            enrolledUnits={overviewEnrolledUnits}
          />
        </div>
      </div>
    </section>
  );
}
