import { ArrowUpRight, GraduationCap, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import {
  enrolmentModeForProgramme,
  enrolmentModeLabel,
} from "@/lib/academic/enrolment-mode";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";
import { publicCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import { StudyTimeline } from "@/ui/profile/study-timeline";

/**
 * The degree a student studies and the years it runs: its name and facts,
 * and a timeline from the start year, where it is changed, to the finish.
 */
export function DegreeSummaryCard({
  degree,
  headingId,
  commencementYear,
  catalogueYear,
  startYears,
  graduationYear,
  planningDuration,
  onStartYearChange,
  onChangeDegree,
}: {
  degree: ProgrammeOption | undefined;
  headingId: string;
  commencementYear: number;
  catalogueYear: number;
  startYears: number[];
  graduationYear: number | null;
  planningDuration: number | null;
  onStartYearChange: (year: number) => void;
  onChangeDegree: () => void;
}) {
  const facts = degree
    ? [
        degree.code,
        degree.durationYears
          ? `${degree.durationYears} ${degree.durationYears === 1 ? "year" : "years"}`
          : null,
        degree.units ? `${degree.units} units` : null,
        enrolmentModeLabel(enrolmentModeForProgramme(degree)),
      ].filter((fact): fact is string => Boolean(fact))
    : [];
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          >
            <GraduationCap className="size-6" />
          </span>
          <div className="min-w-0">
            <h2
              id={headingId}
              className="text-2xl leading-tight font-semibold tracking-tight text-foreground"
            >
              {degree ? (
                <a
                  href={publicCatalogueRecordPath(
                    "programme",
                    degree.catalogueYear,
                    degree.code,
                  )}
                  target="_blank"
                  rel="noopener"
                  className="group rounded-sm outline-none hover:underline hover:decoration-muted-foreground hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {degree.name}
                  <ArrowUpRight
                    aria-hidden="true"
                    className="ml-1 inline size-5 align-baseline text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                  />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                "Choose your degree"
              )}
            </h2>
            {degree ? (
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {facts.map((fact) => (
                  <li
                    key={fact}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {fact}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Your requirements, planner and progress all follow the degree
                you choose.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={degree ? "outline" : "default"}
            onClick={onChangeDegree}
          >
            {degree ? "Change degree" : "Choose a degree"}
          </Button>
        </div>
      </div>

      <div className="mt-7">
        <StudyTimeline
          firstYear={commencementYear}
          lastYear={
            graduationYear !== null && graduationYear >= commencementYear
              ? graduationYear
              : commencementYear
          }
          currentYear={new Date().getFullYear()}
          startYears={startYears}
          onStartYearChange={onStartYearChange}
        />
      </div>
      {graduationYear !== null ? (
        <p className="sr-only">Finishes end of {graduationYear}</p>
      ) : null}
      {catalogueYear !== commencementYear ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {commencementYear} rules aren&apos;t in Coursemap yet, so your plan
          uses {catalogueYear}.
        </p>
      ) : null}
      {degree && planningDuration === null ? (
        <Alert variant="warning" className="mt-5">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            Planning is not available for this programme yet. Your current plan
            is unchanged.
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
