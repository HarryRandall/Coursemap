import { cn } from "@/lib/cn";
import type { CourseOffering } from "@/lib/coursemap/course-types";
import {
  offeringShortName,
  offeringSpan,
  offeringStanding,
  yearFraction,
} from "@/lib/coursemap/offering-timeline";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * The year at a glance: one bar per study period across twelve months, with
 * today marked. Finished periods fade so the ones still ahead stand out.
 */
export function OfferingYearStrip({
  offerings,
  today,
  year,
}: {
  offerings: readonly CourseOffering[];
  today: string;
  year: number;
}) {
  const bars = offerings.flatMap((offering) => {
    const span = offeringSpan(offering, year);
    return span ? [{ offering, span }] : [];
  });
  if (bars.length === 0) return null;
  const now = yearFraction(today, year);
  return (
    <figure className="px-5 pt-1 pb-7">
      <figcaption className="sr-only">
        {`When this course runs in ${year}`}
      </figcaption>
      <div className="relative">
        <div className="grid grid-cols-12 border-b border-border/60">
          {MONTHS.map((month, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="border-l border-border/40 pb-1 pl-1 text-[10px] text-muted-foreground/70 first:border-l-0"
            >
              {month}
            </span>
          ))}
        </div>
        <ul className="relative mt-2 space-y-1.5">
          {bars.map(({ offering, span }) => {
            const finished =
              offeringStanding(offering, today).phase === "finished";
            return (
              <li
                key={`${offering.periodCode}:${offering.classNumber ?? ""}`}
                className="relative h-5"
              >
                <span
                  className={cn(
                    "absolute inset-y-0 flex min-w-0 items-center overflow-hidden rounded-md px-2 text-[11px] font-medium whitespace-nowrap",
                    finished
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/15 text-primary",
                  )}
                  style={{
                    left: `${span.start * 100}%`,
                    width: `${(span.end - span.start) * 100}%`,
                  }}
                >
                  {offeringShortName(offering)}
                </span>
              </li>
            );
          })}
        </ul>
        {now !== null ? (
          <span
            aria-hidden="true"
            className="absolute top-5 -bottom-1 border-l border-dashed border-foreground/50"
            style={{ left: `${now * 100}%` }}
          >
            <span className="absolute top-full mt-0.5 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap text-foreground/70">
              Today
            </span>
          </span>
        ) : null}
      </div>
    </figure>
  );
}
