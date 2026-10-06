import type { CSSProperties } from "react";
import { LandingPlannerDemo } from "@/ui/landing/landing-planner-demo";
import { LandingReveal } from "@/ui/landing/landing-reveal";

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

/** The planner, small enough to try on the page. */
export function LandingPlanner() {
  return (
    <section className="border-b border-border">
      <LandingReveal className="mx-auto max-w-6xl border-x border-border px-4 py-12 sm:px-10 sm:py-16">
        <div className="max-w-2xl">
          <p className="enter-rise font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Planner
          </p>
          <h2
            className="enter-rise mt-3 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl"
            style={delay(80)}
          >
            Semester one and two first, short sessions when you want them.
          </h2>
        </div>
        <div className="enter-rise mt-10" style={delay(160)}>
          <LandingPlannerDemo />
        </div>
      </LandingReveal>
    </section>
  );
}
