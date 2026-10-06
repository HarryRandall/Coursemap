import { Button } from "@coursemap/ui/primitives/button";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { LandingGridBackground } from "@/ui/landing/landing-grid-background";
import { LandingHeroAccents } from "@/ui/landing/landing-hero-accents";
import { LandingOverview } from "@/ui/landing/landing-overview";
import { LandingReveal } from "@/ui/landing/landing-reveal";
import type { UniversityCalendarEvent } from "@/lib/coursemap/university-calendar";

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

export function LandingHero({
  keyDates,
  today,
}: {
  /** The next few published key dates, for the dashboard's card. */
  keyDates: readonly UniversityCalendarEvent[];
  today: string;
}) {
  return (
    <section className="relative isolate border-b border-border">
      <LandingGridBackground />
      <LandingReveal className="relative mx-auto max-w-6xl border-x border-border px-4 pt-14 pb-10 sm:px-10 sm:pt-20 sm:pb-14">
        <div className="relative">
          <LandingHeroAccents />
          <div className="relative flex flex-col items-center pb-16 text-center sm:pb-24">
            <h1
              className="enter-rise max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-foreground sm:text-6xl"
              style={delay(80)}
            >
              Plan your degree, semester by semester.
            </h1>
            <p
              className="enter-rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
              style={delay(160)}
            >
              Search the catalogue, follow prerequisites and watch every
              requirement fill as you place courses.
            </p>

            <div
              className="enter-rise mt-8 flex flex-col gap-2 sm:flex-row"
              style={delay(240)}
            >
              <Button asChild size="lg" className="h-11 px-5">
                <Link href="/signup">
                  Get started
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5">
                <Link href="/courses">Explore courses</Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="enter-rise" style={delay(420)}>
          <LandingOverview keyDates={keyDates} today={today} />
        </div>
      </LandingReveal>
    </section>
  );
}
