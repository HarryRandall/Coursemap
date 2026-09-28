import { TriangleAlert } from "lucide-react";
import type { KeyDatesPeriodReview } from "@/lib/admin/key-dates";
import { academicPeriodDates } from "@/lib/coursemap/academic-periods";

export function KeyDatesPeriodReviewList({
  periods,
}: {
  periods: KeyDatesPeriodReview[];
}) {
  return (
    <section
      aria-labelledby="academic-period-review"
      className="rounded-xl border border-border bg-card p-4"
    >
      <h3 id="academic-period-review" className="text-sm font-medium">
        Semesters and sessions
      </h3>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {periods.map((period) => {
          const changed =
            period.startsOn !== period.previousStartsOn ||
            period.endsOn !== period.previousEndsOn;
          return (
            <li key={period.code} className="space-y-1 text-sm">
              <p className="font-medium">{period.name}</p>
              <p>{academicPeriodDates(period.startsOn, period.endsOn)}</p>
              {changed && period.previousStartsOn && period.previousEndsOn ? (
                <p className="text-xs text-muted-foreground">
                  Previously:{" "}
                  {academicPeriodDates(
                    period.previousStartsOn,
                    period.previousEndsOn,
                  )}
                </p>
              ) : null}
              {period.issue && period.issue !== "Calendar dates pending." ? (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                    size={12}
                  />
                  {period.issue}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
