"use client";
import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  MousePointerClick,
  Plus,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

type DemoSession = "S1" | "S2" | "Summer" | "Winter";

type DemoCourse = {
  code: string;
  name: string;
  sessions: readonly DemoSession[];
  /** Starred by the student rather than required by the degree. */
  picked?: boolean;
};

type DemoYear = {
  label: string;
  year: number;
  courses: readonly DemoCourse[];
};

const YEARS: readonly DemoYear[] = [
  {
    label: "Year 1",
    year: 2026,
    courses: [
      {
        code: "COMP1100",
        name: "Programming as Problem Solving",
        sessions: ["S1", "S2"],
      },
      {
        code: "MATH1013",
        name: "Mathematics and Applications 1",
        sessions: ["S1", "S2"],
      },
      { code: "COMP1600", name: "Foundations of Computing", sessions: ["S2"] },
      {
        code: "COMP1110",
        name: "Structured Programming",
        sessions: ["S1", "S2"],
      },
      {
        code: "MATH1014",
        name: "Mathematics and Applications 2",
        sessions: ["S1", "S2"],
      },
      {
        code: "STAT1003",
        name: "Statistical Techniques",
        sessions: ["Summer", "S1", "S2"],
        picked: true,
      },
    ],
  },
  {
    label: "Year 2",
    year: 2027,
    courses: [
      {
        code: "COMP2100",
        name: "Software Design Methodologies",
        sessions: ["S1", "S2"],
      },
      { code: "COMP2300", name: "Computer Organisation", sessions: ["S1"] },
      { code: "COMP2120", name: "Software Engineering", sessions: ["S2"] },
      {
        code: "COMP2310",
        name: "Systems, Networks and Concurrency",
        sessions: ["S2"],
      },
      {
        code: "COMP2420",
        name: "Data Management and Analysis",
        sessions: ["S1"],
      },
      {
        code: "ECON1101",
        name: "Microeconomics 1",
        sessions: ["Winter", "S1", "S2"],
        picked: true,
      },
    ],
  },
  {
    label: "Year 3",
    year: 2028,
    courses: [
      { code: "COMP3600", name: "Algorithms", sessions: ["S2"] },
      {
        code: "COMP3120",
        name: "Managing Software Development",
        sessions: ["S1"],
      },
      {
        code: "COMP3500",
        name: "Software Engineering Project",
        sessions: ["S1", "S2"],
      },
      {
        code: "COMP3670",
        name: "Introduction to Machine Learning",
        sessions: ["S2"],
        picked: true,
      },
      { code: "COMP3425", name: "Data Mining", sessions: ["S2"], picked: true },
    ],
  },
];

const INITIAL: Record<string, DemoSession> = {
  COMP1100: "S1",
  MATH1013: "S1",
  COMP1600: "S2",
  COMP2100: "S1",
  COMP2300: "S1",
  COMP2120: "S2",
  COMP3120: "S1",
};

const SLOTS = 4;
const UNITS = 6;
const LANES = ["S1", "S2"] as const;
const SHORT_SESSIONS: readonly DemoSession[] = ["Summer", "Winter"];

/**
 * A small working planner for the landing page: three years to click
 * through, courses to plan on the right placed into the first semester they
 * run in with room, and taken back out with a click.
 */
export function LandingPlannerDemo() {
  const [placed, setPlaced] = useState(INITIAL);
  const [yearIndex, setYearIndex] = useState(0);
  const current = YEARS[yearIndex];

  const unitsIn = (year: DemoYear) =>
    year.courses.filter(
      (course) =>
        placed[course.code] && !SHORT_SESSIONS.includes(placed[course.code]),
    ).length * UNITS;
  const inSession = (session: DemoSession) =>
    current.courses.filter((course) => placed[course.code] === session);
  const toPlan = current.courses.filter((course) => !placed[course.code]);
  const required = current.courses.filter((course) => !course.picked);
  const requiredPlaced = required.filter((course) => placed[course.code]);
  const shortPlaced = current.courses.filter((course) =>
    SHORT_SESSIONS.includes(placed[course.code]),
  );

  const place = (course: DemoCourse) => {
    // Semesters first, as the planner does; a short session only when the
    // semesters it runs in are full.
    const session =
      LANES.find(
        (lane) =>
          course.sessions.includes(lane) && inSession(lane).length < SLOTS,
      ) ?? course.sessions.find((item) => SHORT_SESSIONS.includes(item));
    if (session) setPlaced((state) => ({ ...state, [course.code]: session }));
  };
  const remove = (code: string) =>
    setPlaced((state) => {
      const next = { ...state };
      delete next[code];
      return next;
    });

  const row = (course: DemoCourse, session?: DemoSession) => (
    <button
      key={course.code}
      type="button"
      onClick={() => remove(course.code)}
      aria-label={`Take ${course.code} out of the plan`}
      className="group flex h-11 w-full animate-drop-slot-in items-center gap-2 rounded-md px-2 text-left transition hover:bg-muted/60"
    >
      <Circle
        size={13}
        aria-hidden="true"
        className="shrink-0 text-muted-foreground/50"
      />
      <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
        {course.code}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
        {course.name}
      </span>
      {session ? (
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {session}
        </span>
      ) : null}
      <X
        size={12}
        aria-hidden="true"
        className="shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100"
      />
    </button>
  );

  return (
    <section
      aria-label="Example planner"
      className="overflow-hidden rounded-lg border border-border bg-background text-left"
    >
      <div
        role="tablist"
        aria-label="Years"
        className="grid grid-cols-3 border-b border-border text-[12px]"
      >
        {YEARS.map((year, index) => {
          const selected = index === yearIndex;
          return (
            <button
              key={year.year}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setYearIndex(index)}
              className={cn(
                "flex cursor-pointer flex-col gap-1.5 border-r border-border px-3 py-2.5 text-left transition-colors last:border-r-0 sm:px-4",
                selected
                  ? "bg-background text-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">
                  {year.label}
                  <span className="text-muted-foreground"> · {year.year}</span>
                </span>
                <span className="hidden text-[11px] text-muted-foreground tabular-nums sm:inline">
                  {unitsIn(year)} / 48
                </span>
              </span>
              <span
                aria-hidden="true"
                className="h-1 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full bg-primary transition-[width] duration-500"
                  style={{ width: `${(unitsIn(year) / 48) * 100}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div
        key={current.year}
        className="grid animate-fade-in md:grid-cols-[minmax(0,1fr)_17rem]"
      >
        <div className="space-y-3 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {LANES.map((lane) => {
              const courses = inSession(lane);
              return (
                <div
                  key={lane}
                  className="rounded-md border border-border p-1.5"
                >
                  <p className="flex items-baseline justify-between px-1.5 pt-0.5 pb-1.5 text-[12px] font-semibold text-foreground">
                    {lane === "S1" ? "First Semester" : "Second Semester"}
                    <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                      {courses.length * UNITS} / 24
                    </span>
                  </p>
                  <div className="space-y-1">
                    {courses.map((course) => row(course))}
                    {Array.from(
                      { length: SLOTS - courses.length },
                      (_, index) => (
                        <div
                          key={index}
                          aria-hidden="true"
                          className="h-11 rounded-md border border-dashed border-border"
                        />
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-md border border-border p-1.5">
            <p className="px-1.5 pt-0.5 pb-1.5 text-[12px] font-semibold text-foreground">
              Short sessions
              <span className="ml-2 font-normal text-muted-foreground">
                Summer · Autumn · Winter · Spring
              </span>
            </p>
            <div className="space-y-1">
              {shortPlaced.map((course) => row(course, placed[course.code]))}
              <div
                aria-hidden="true"
                className="flex h-9 items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground"
              >
                Optional
              </div>
            </div>
          </div>
        </div>

        <aside
          aria-label="Courses to plan"
          className="flex flex-col border-t border-border bg-background md:border-t-0 md:border-l"
        >
          <div className="space-y-2 border-b border-border px-4 py-3">
            <p className="flex items-baseline justify-between text-[12px] font-semibold text-foreground">
              Required courses
              <span className="font-normal text-muted-foreground tabular-nums">
                {requiredPlaced.length} / {required.length}
              </span>
            </p>
            <span
              aria-hidden="true"
              className="block h-1 overflow-hidden rounded-full bg-muted"
            >
              <span
                className="block h-full bg-success transition-[width] duration-500"
                style={{
                  width: `${(requiredPlaced.length / required.length) * 100}%`,
                }}
              />
            </span>
          </div>
          <ul className="flex-1 space-y-0.5 p-2">
            {toPlan.map((course) => (
              <li key={course.code}>
                <button
                  type="button"
                  onClick={() => place(course)}
                  aria-label={`Place ${course.code} in a semester`}
                  className="group grid h-11 w-full grid-cols-[0.75rem_4rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 text-left transition hover:bg-muted"
                >
                  {course.picked ? (
                    <Star
                      size={12}
                      aria-label="Starred"
                      className="fill-amber-400 text-amber-500"
                    />
                  ) : (
                    <span />
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {course.code}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-foreground">
                      {course.name}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {course.sessions.join(" ")}
                    </span>
                  </span>
                  <Plus
                    size={13}
                    aria-hidden="true"
                    className="text-muted-foreground transition group-hover:text-foreground"
                  />
                </button>
              </li>
            ))}
            {toPlan.length === 0 ? (
              <li className="flex items-center gap-2 px-2 py-2 text-[12px] text-success">
                <CheckCircle2 size={13} aria-hidden="true" />
                Everything for {current.label} is placed
              </li>
            ) : null}
          </ul>
          <p className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
            <MousePointerClick size={12} aria-hidden="true" />
            Click a course to place it, or a year to switch
          </p>
        </aside>
      </div>
    </section>
  );
}
