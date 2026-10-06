"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

type LoopCourse = { code: string; name: string };
type LoopYear = {
  label: string;
  /** First Semester's four courses, then Second Semester's. */
  courses: readonly LoopCourse[];
};

const YEARS: readonly LoopYear[] = [
  {
    label: "Year 1 · 2026",
    courses: [
      { code: "COMP1100", name: "Programming as Problem Solving" },
      { code: "MATH1013", name: "Mathematics and Applications 1" },
      { code: "STAT1003", name: "Statistical Techniques" },
      { code: "ECON1101", name: "Microeconomics 1" },
      { code: "COMP1110", name: "Structured Programming" },
      { code: "COMP1600", name: "Foundations of Computing" },
      { code: "MATH1014", name: "Mathematics and Applications 2" },
      { code: "ECON1102", name: "Macroeconomics 1" },
    ],
  },
  {
    label: "Year 2 · 2027",
    courses: [
      { code: "COMP2100", name: "Software Design Methodologies" },
      { code: "COMP2300", name: "Computer Organisation" },
      { code: "COMP2420", name: "Data Management and Analysis" },
      { code: "MATH2222", name: "Introduction to Mathematical Thinking" },
      { code: "COMP2120", name: "Software Engineering" },
      { code: "COMP2310", name: "Systems, Networks and Concurrency" },
      { code: "STAT2001", name: "Introductory Mathematical Statistics" },
      { code: "ECON2101", name: "Microeconomics 2" },
    ],
  },
  {
    label: "Year 3 · 2028",
    courses: [
      { code: "COMP3120", name: "Managing Software Development" },
      { code: "COMP3425", name: "Data Mining" },
      { code: "COMP3500", name: "Software Engineering Project" },
      { code: "COMP3900", name: "Human-Computer Interaction" },
      { code: "COMP3600", name: "Algorithms" },
      { code: "COMP3670", name: "Introduction to Machine Learning" },
      { code: "COMP3710", name: "Topics in Computer Science" },
      { code: "STAT3040", name: "Statistical Learning" },
    ],
  },
];

const SLOTS = 4;
const UNITS = 6;
/** Between one course landing and the next. */
const STEP_MS = 650;
/** How long a full year stays up before the next one starts. */
const HOLD_MS = 2600;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A year planning itself, on a loop: First and Second Semester fill one
 * course at a time, the units climb, and the full year moves on to the
 * next. Decorative; with reduced motion it shows a finished year.
 */
export function LandingPlanLoop({
  startYear = 0,
  onFinished,
}: {
  /** Which of the example years to plan first. */
  startYear?: number;
  /** Called once a year is planned, instead of moving on to the next. */
  onFinished?: () => void;
} = {}) {
  const [yearIndex, setYearIndex] = useState(startYear % YEARS.length);
  const [placed, setPlaced] = useState(0);
  const reduced = useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const year = YEARS[yearIndex];
  const shown = reduced ? year.courses.length : placed;
  const full = shown >= year.courses.length;
  const units = shown * UNITS;

  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(
      () => {
        if (!full) setPlaced((current) => current + 1);
        else if (onFinished) onFinished();
        else {
          setYearIndex((current) => (current + 1) % YEARS.length);
          setPlaced(0);
        }
      },
      full ? HOLD_MS : placed === 0 ? 500 : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [reduced, full, placed, onFinished]);

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-lg border border-border bg-background shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span
          key={year.label}
          className="animate-fade-in text-[13px] font-semibold text-foreground"
        >
          {year.label}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
          {full ? (
            <span className="flex animate-fade-in items-center gap-1 font-medium text-success">
              <CheckCircle2 size={12} />
              Year planned
            </span>
          ) : null}
          {units} / 48 units
        </span>
      </div>
      <div className="h-1 bg-muted">
        <div
          className={cn(
            "h-full transition-[width,background-color] duration-500",
            full ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${(units / 48) * 100}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 p-3">
        {["First Semester", "Second Semester"].map((semester, lane) => (
          <div key={semester} className="rounded-md border border-border p-1.5">
            <p className="px-1.5 pt-0.5 pb-1.5 text-[11px] font-semibold text-foreground">
              {semester}
            </p>
            <div className="space-y-1">
              {Array.from({ length: SLOTS }, (_, slot) => {
                const index = lane * SLOTS + slot;
                const course = year.courses[index];
                return index < shown ? (
                  <div
                    key={`${year.label}-${course.code}`}
                    className="flex h-10 animate-drop-slot-in items-center gap-2 rounded-md bg-primary/10 px-2 ring-1 ring-primary/25 ring-inset"
                  >
                    <CheckCircle2
                      size={12}
                      className="shrink-0 animate-count-pop text-success"
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {course.code}
                    </span>
                    <span className="min-w-0 truncate text-[11px] font-medium text-foreground">
                      {course.name}
                    </span>
                  </div>
                ) : (
                  <div
                    key={`${year.label}-empty-${index}`}
                    className="h-10 rounded-md border border-dashed border-border"
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
