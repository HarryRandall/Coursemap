import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowUpRight, CheckCircle2, Circle, Search } from "lucide-react";
import { LandingReveal } from "@/ui/landing/landing-reveal";

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

type Feature = {
  title: string;
  description: string;
  href: string;
  visual: ReactNode;
};

const features: readonly Feature[] = [
  {
    title: "The whole catalogue",
    description: "Every course, offering and session, by catalogue year.",
    href: "/courses",
    visual: (
      <div className="space-y-1.5">
        <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-[12px] text-muted-foreground">
          <Search className="size-3.5" />
          machine learning
        </div>
        {[
          ["COMP3670", "Introduction to Machine Learning", "S2"],
          ["COMP4670", "Statistical Machine Learning", "S1"],
        ].map(([code, name, session]) => (
          <div
            key={code}
            className="flex h-8 items-center gap-2 rounded-md bg-muted/60 px-2.5 text-[12px]"
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              {code}
            </span>
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className="text-[10px] text-muted-foreground">{session}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Prerequisites in order",
    description: "See what a course needs and what it opens up next.",
    href: "/courses/2026/comp2100",
    visual: (
      <ol className="space-y-1.5">
        {[
          ["COMP1100", "Completed", true],
          ["COMP1110", "Completed", true],
          ["COMP2100", "Ready to plan", false],
        ].map(([code, status, done]) => (
          <li
            key={code as string}
            className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-[12px]"
          >
            {done ? (
              <CheckCircle2 className="size-3.5 text-success" />
            ) : (
              <Circle className="size-3.5 text-primary" />
            )}
            <span className="font-mono text-[11px]">{code}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {status}
            </span>
          </li>
        ))}
      </ol>
    ),
  },
  {
    title: "Requirements that fill",
    description: "Units, majors and rules update as the plan changes.",
    href: "/requirements",
    visual: (
      <div className="space-y-3">
        {[
          ["Degree", 62],
          ["Computer Science major", 75],
          ["Electives", 25],
        ].map(([label, percent]) => (
          <div key={label as string} className="space-y-1">
            <p className="flex justify-between text-[11px] text-muted-foreground">
              <span>{label}</span>
              <span className="tabular-nums">{percent}%</span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="enter-grow-across h-full bg-primary"
                style={{ width: `${percent}%`, ...delay(300) }}
              />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Course details in one view",
    description: "Units, offerings, fees and what a course counts towards.",
    href: "/courses/2026/comp2100",
    visual: (
      <dl className="grid grid-cols-2 gap-1.5 text-[12px]">
        {[
          ["Units", "6"],
          ["Offered", "S1 · S2"],
          ["Level", "2000"],
          ["Counts towards", "CS major"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-border bg-background px-2.5 py-1.5"
          >
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    ),
  },
  {
    title: "Every rules year",
    description: "Plans follow the rules for the year you started.",
    href: "/programmes",
    visual: (
      <div className="flex gap-1.5">
        {[2024, 2025, 2026].map((year) => (
          <span
            key={year}
            className={
              year === 2025
                ? "flex h-8 flex-1 items-center justify-center rounded-md bg-primary text-[12px] font-medium text-primary-foreground"
                : "flex h-8 flex-1 items-center justify-center rounded-md border border-border bg-background text-[12px] text-muted-foreground"
            }
          >
            {year}
          </span>
        ))}
      </div>
    ),
  },
  {
    title: "Your choices stay yours",
    description:
      "Star options in Requirements; the planner never picks for you.",
    href: "/signup",
    visual: (
      <div className="space-y-1.5">
        {[
          ["Pick one", "ECON1101 starred"],
          ["Electives", "48 units left"],
        ].map(([rule, state]) => (
          <div
            key={rule}
            className="flex h-8 items-center justify-between rounded-md bg-muted/60 px-2.5 text-[12px]"
          >
            <span className="font-medium">{rule}</span>
            <span className="text-[11px] text-muted-foreground">{state}</span>
          </div>
        ))}
      </div>
    ),
  },
];

/** What Coursemap covers, as a bordered grid of small working views. */
export function LandingFeatureGrid() {
  return (
    <section className="relative isolate border-b border-border after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:z-10 after:h-px after:bg-border">
      <LandingReveal className="mx-auto max-w-6xl border-x border-border">
        <div className="border-b border-border px-4 py-10 sm:px-10 sm:py-14">
          <h2 className="enter-rise max-w-2xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            The catalogue, the rules and your plan in one place.
          </h2>
        </div>
        <ul className="grid gap-px overflow-hidden bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <li
              key={feature.title}
              style={delay(100 + index * 70)}
              className="enter-rise group relative flex flex-col gap-5 bg-background p-6 transition-colors hover:bg-muted/30 sm:p-8"
            >
              <div aria-hidden="true" className="min-h-28">
                {feature.visual}
              </div>
              <div>
                <h3 className="flex items-center gap-1 text-[15px] font-semibold text-foreground">
                  <Link
                    href={feature.href}
                    className="after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {feature.title}
                  </Link>
                  <ArrowUpRight
                    className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </LandingReveal>
    </section>
  );
}
