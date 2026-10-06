import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { LandingReveal } from "@/ui/landing/landing-reveal";

type Showcase = {
  title: string;
  description: string;
  href: string;
  className?: string;
  visual: ReactNode;
};

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

const FLOORS = 4;
/** Rooms per floor, as columns × rows. */
const ROOMS = 6;
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const TODAY = 2;
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16] as const;
const HOUR_PX = 26;
/** Course colours come from the chart tokens, so both themes stay legible. */
const CLASSES = [
  { day: 0, start: 10, length: 2, code: "COMP2100", kind: "Lecture", chart: 1 },
  {
    day: 0,
    start: 14,
    length: 1,
    code: "MATH1014",
    kind: "Tutorial",
    chart: 2,
  },
  { day: 1, start: 9, length: 1, code: "MATH1014", kind: "Lecture", chart: 2 },
  { day: 1, start: 13, length: 2, code: "COMP2300", kind: "Lab", chart: 3 },
  {
    day: 2,
    start: 11,
    length: 2,
    code: "COMP2100",
    kind: "Workshop",
    chart: 1,
  },
  { day: 2, start: 15, length: 1, code: "STAT1003", kind: "Lecture", chart: 4 },
  { day: 3, start: 10, length: 1, code: "COMP2300", kind: "Lecture", chart: 3 },
  { day: 3, start: 12, length: 2, code: "COMP2120", kind: "Studio", chart: 5 },
  { day: 4, start: 9, length: 2, code: "STAT1003", kind: "Lab", chart: 4 },
] as const;
/** Half past eleven on Wednesday, as a share of the day's hours. */
const NOW_HOUR = 11.5;

const showcases: readonly Showcase[] = [
  {
    title: "Room finder",
    description: "Find a room inside the building, floor by floor, in 3D.",
    href: "/rooms",
    visual: (
      <div className="relative grid h-48 place-items-center [--spread:16px] [perspective:700px] group-hover:[--spread:30px]">
        <div className="relative size-28 [transform:rotateX(58deg)_rotateZ(-38deg)] transition-transform duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateX(52deg)_rotateZ(-30deg)]">
          {Array.from({ length: FLOORS }, (_, floor) => (
            <div
              key={floor}
              className={cn(
                "absolute inset-0 grid grid-cols-3 gap-1 rounded-[3px] border p-1.5 shadow-sm transition-[transform,opacity,background-color] duration-500",
                floor === 2
                  ? "border-primary/70 bg-primary/15"
                  : "border-border bg-card",
                floor > 2 && "group-hover:opacity-30",
              )}
              style={{
                transform: `translateZ(calc(var(--spread) * ${floor}))`,
              }}
            >
              {Array.from({ length: ROOMS }, (_, room) => (
                <span
                  key={room}
                  className={cn(
                    "rounded-[2px] border transition-colors duration-500",
                    floor === 2 && room === 0
                      ? "animate-pulse border-primary bg-primary"
                      : "border-transparent group-hover:border-foreground/15 group-hover:bg-muted/60",
                  )}
                  style={{
                    transitionDelay: `${(floor * ROOMS + room) * 15}ms`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <span className="absolute top-2 right-2 translate-y-1 rounded-sm border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <span className="font-medium text-foreground">Level 2</span> · Room
          2.14
        </span>
      </div>
    ),
  },
  {
    title: "Your week at a glance",
    description:
      "Lectures, labs and tutorials from your plan, on one timetable.",
    href: "/calendar",
    className: "lg:col-span-2",
    visual: (
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="grid grid-cols-[2.5rem_repeat(5,minmax(0,1fr))] border-b border-border text-[10px]">
          <span />
          {WEEK.map((day, index) => (
            <span
              key={day}
              className={cn(
                "flex items-center justify-center gap-1 border-l border-border py-1.5 font-medium",
                index === TODAY ? "text-primary" : "text-muted-foreground",
              )}
            >
              {index === TODAY ? (
                <span className="size-1.5 rounded-full bg-primary" />
              ) : null}
              {day}
            </span>
          ))}
        </div>
        <div className="relative grid grid-cols-[2.5rem_repeat(5,minmax(0,1fr))]">
          <div>
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="block pr-1.5 text-right text-[9px] text-muted-foreground tabular-nums"
                style={{ height: HOUR_PX }}
              >
                {hour > 12 ? hour - 12 : hour}
                {hour >= 12 ? "pm" : "am"}
              </span>
            ))}
          </div>
          {WEEK.map((day, dayIndex) => (
            <div
              key={day}
              className={cn(
                "relative border-l border-border",
                dayIndex === TODAY && "bg-primary/[0.03]",
              )}
              style={{
                height: HOURS.length * HOUR_PX,
                backgroundImage:
                  "linear-gradient(to bottom, color-mix(in oklab, var(--border) 60%, transparent) 1px, transparent 1px)",
                backgroundSize: `100% ${HOUR_PX}px`,
              }}
            >
              {CLASSES.filter((item) => item.day === dayIndex).map(
                (item, index) => (
                  <span
                    key={`${item.code}-${item.start}`}
                    className="enter-pop absolute inset-x-0.5 overflow-hidden rounded-[3px] border-l-2 px-1 py-0.5"
                    style={{
                      top: (item.start - HOURS[0]) * HOUR_PX + 1,
                      height: item.length * HOUR_PX - 2,
                      borderColor: `var(--chart-${item.chart})`,
                      background: `color-mix(in oklab, var(--chart-${item.chart}) 16%, transparent)`,
                      ...delay(dayIndex * 70 + index * 40),
                    }}
                  >
                    <span className="block truncate font-mono text-[9px] font-semibold text-foreground">
                      {item.code}
                    </span>
                    {item.length > 1 ? (
                      <span className="block truncate text-[9px] text-muted-foreground">
                        {item.kind}
                      </span>
                    ) : null}
                  </span>
                ),
              )}
              {dayIndex === TODAY ? (
                <span
                  className="absolute inset-x-0 z-10 h-px bg-primary"
                  style={{ top: (NOW_HOUR - HOURS[0]) * HOUR_PX }}
                >
                  <span className="absolute -top-[3px] -left-[3px] size-[7px] rounded-full bg-primary" />
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Societies and events",
    description: "Browse clubs and see what is on this week.",
    href: "/societies",
    // Filled from the published directory when the page renders.
    visual: null,
  },
];

/**
 * The rest of student life Coursemap covers, beyond planning. `keyDates` and
 * `societies` are live from the database, or null when nothing is published.
 */
export function LandingCampus({
  keyDates,
  societies,
}: {
  keyDates: ReactNode;
  societies: ReactNode;
}) {
  return (
    <section className="relative isolate border-b border-border after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:z-10 after:h-px after:bg-border">
      <LandingReveal className="mx-auto max-w-6xl border-x border-border">
        <div className="border-b border-border px-4 py-10 sm:px-10 sm:py-14">
          <p className="enter-rise font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Beyond the planner
          </p>
          <h2
            className="enter-rise mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl"
            style={delay(80)}
          >
            The rest of campus, in the same place.
          </h2>
        </div>
        <ul className="grid gap-px overflow-hidden bg-border lg:grid-cols-3">
          {showcases.map((item, index) => (
            <li
              key={item.title}
              className={cn(
                "enter-rise group relative flex flex-col gap-5 bg-background p-6 transition-colors hover:bg-muted/30 sm:p-8",
                item.className,
              )}
              style={delay(120 + index * 90)}
            >
              <div aria-hidden="true" className="min-h-32">
                {item.href === "/societies"
                  ? (societies ?? (
                      <p className="text-sm text-muted-foreground">
                        Societies appear here once the directory is published.
                      </p>
                    ))
                  : item.visual}
              </div>
              <div>
                <h3 className="flex items-center gap-1 text-[15px] font-semibold text-foreground">
                  <Link
                    href={item.href}
                    className="after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {item.title}
                  </Link>
                  <ArrowUpRight
                    className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
          <li
            className="enter-rise group relative flex flex-col gap-5 bg-background p-6 transition-colors hover:bg-muted/30 sm:p-8 lg:col-span-2"
            style={delay(120 + showcases.length * 90)}
          >
            <div className="min-h-32">
              {keyDates ?? (
                <p className="text-sm text-muted-foreground">
                  Dates appear here once the university calendar is published.
                </p>
              )}
            </div>
            <div>
              <h3 className="flex items-center gap-1 text-[15px] font-semibold text-foreground">
                <Link href="/key-dates">Key dates, counted down</Link>
                <ArrowUpRight
                  className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                />
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Live from the ANU calendar: census, drop deadlines and exams,
                with the next one counted down.
              </p>
            </div>
          </li>
        </ul>
      </LandingReveal>
    </section>
  );
}
