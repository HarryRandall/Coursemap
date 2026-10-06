import type { CSSProperties } from "react";
import type { ShowcaseCourse } from "@/lib/coursemap/landing-courses";
import { LandingCourseShowcase } from "@/ui/landing/landing-course-showcase";
import { LandingReveal } from "@/ui/landing/landing-reveal";

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

/** Real courses' prerequisites, as the course pages show them. */
export function LandingRequirements({
  courses,
}: {
  courses: readonly ShowcaseCourse[];
}) {
  if (courses.length === 0) return null;
  return (
    <section className="border-b border-border">
      <LandingReveal className="mx-auto grid max-w-6xl gap-8 border-x border-border px-4 py-12 sm:px-10 sm:py-16 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12">
        <div className="space-y-4">
          <p className="enter-rise font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Prerequisites
          </p>
          <h2
            className="enter-rise text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl"
            style={delay(80)}
          >
            Know what a course needs before you enrol.
          </h2>
          <p
            className="enter-rise text-sm leading-relaxed text-muted-foreground sm:text-base"
            style={delay(160)}
          >
            Every course&apos;s rules, read from the ANU catalogue and checked
            against what you have done: as a list of steps, or as the chain of
            courses behind it.
          </p>
        </div>
        <div className="enter-rise min-w-0" style={delay(240)}>
          <LandingCourseShowcase courses={courses} />
        </div>
      </LandingReveal>
    </section>
  );
}
