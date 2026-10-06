"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CheckCircle2, GitBranch, ListChecks, Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ShowcaseCourse } from "@/lib/coursemap/landing-courses";
import { evaluateRule } from "@/lib/coursemap/requisite-evaluation";
import { completionPath, studentWith } from "@/lib/coursemap/requisite-path";
import { EnrolmentSteps } from "@/ui/courses/enrolment-steps";
import { RequisiteDiagram } from "@/ui/courses/requisite-diagram";
import { LandingFit } from "@/ui/landing/landing-fit";

/** How long each course takes to be completed, one after another. */
const STEP_MS = 1100;
/** How long a course stays up once its rule is met, clicked or not. */
const HOLD_MS = 5000;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Four real courses in turn, alternating between the enrolment table and
 * the prerequisite graph the course pages use. An example student completes
 * each course's prerequisites one at a time until the rule is met, then the
 * next course slides in. Picking a course plays it from the start; the
 * pause button stops it.
 */
export function LandingCourseShowcase({
  courses,
  onFinished,
}: {
  courses: readonly ShowcaseCourse[];
  /** Called after the last course instead of starting again from the first. */
  onFinished?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const course = courses[index % courses.length];
  const graph = index % 2 === 1;
  const path = useMemo(
    () => completionPath(course.prerequisiteRule, course.year),
    [course],
  );
  // Without motion the rule is shown met straight away.
  const shown = reduced ? path.length : Math.min(step, path.length);
  const student = useMemo(
    () => studentWith(path.slice(0, shown), course.year),
    [path, shown, course.year],
  );
  const met =
    course.prerequisiteRule !== null &&
    evaluateRule(course.prerequisiteRule, student).status === "met";
  const available = useMemo(
    () => new Set(course.availableCourseCodes),
    [course],
  );

  const show = (next: number) => {
    setIndex(next);
    setStep(0);
  };

  useEffect(() => {
    if (paused || reduced) return;
    const done = step >= path.length;
    const last = index === courses.length - 1;
    if (done && courses.length < 2 && !onFinished) return;
    const timer = window.setTimeout(
      () => {
        if (!done) setStep((current) => current + 1);
        else if (last && onFinished) onFinished();
        else {
          setIndex((current) => (current + 1) % courses.length);
          setStep(0);
        }
      },
      done ? HOLD_MS : step === 0 ? 1200 : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [paused, reduced, step, path.length, index, courses.length, onFinished]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background text-left">
      <div
        role="tablist"
        aria-label="Example courses"
        className="grid border-b border-border"
        style={{
          gridTemplateColumns: `repeat(${courses.length}, minmax(0, 1fr))`,
        }}
      >
        {courses.map((item, itemIndex) => {
          const selected = itemIndex === index;
          const Icon = itemIndex % 2 === 1 ? GitBranch : ListChecks;
          return (
            <button
              key={item.code}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => show(itemIndex)}
              className={cn(
                "relative flex min-w-0 flex-col gap-0.5 border-r border-border px-3 py-2.5 text-left transition-colors last:border-r-0",
                selected
                  ? "bg-background"
                  : "bg-background text-muted-foreground hover:bg-muted/40",
              )}
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <Icon size={12} aria-hidden="true" />
                {item.code}
              </span>
              <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {item.name}
              </span>
              {selected ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-0 left-0 h-0.5 transition-[width,background-color] duration-500",
                    met ? "bg-success" : "bg-primary",
                  )}
                  style={{
                    width: `${path.length > 0 ? (shown / path.length) * 100 : 100}%`,
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        key={course.code}
        role="tabpanel"
        aria-label={`${course.code} ${graph ? "prerequisite graph" : "enrolment requirements"}`}
        className="animate-[landing-slide-in_420ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5">
          <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">
            {course.name}
          </p>
          <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
            {graph ? "Prerequisite graph" : "Enrolment requirements"}
            <button
              type="button"
              onClick={() => setPaused((current) => !current)}
              aria-label={paused ? "Play the examples" : "Pause the examples"}
              className="grid size-6 place-items-center rounded-md border border-border transition hover:bg-muted hover:text-foreground"
            >
              {paused ? (
                <Play size={11} aria-hidden="true" />
              ) : (
                <Pause size={11} aria-hidden="true" />
              )}
            </button>
          </span>
        </div>
        <p
          aria-live="polite"
          className="flex h-8 items-center gap-1.5 overflow-hidden px-4 pt-1 text-[12px] text-muted-foreground sm:px-5"
        >
          {shown === 0 ? (
            "Checking against a new student"
          ) : (
            <>
              Completed
              {path.slice(0, shown).map((code) => (
                <span
                  key={code}
                  className="animate-count-pop rounded-sm bg-success/15 px-1.5 py-0.5 font-mono text-[11px] text-success"
                >
                  {code}
                </span>
              ))}
            </>
          )}
          {met ? (
            <span className="ml-1 flex animate-fade-in items-center gap-1 font-medium text-success">
              <CheckCircle2 size={13} aria-hidden="true" />
              Ready to enrol
            </span>
          ) : null}
        </p>
        <LandingFit className="h-[30rem] pt-3 text-[13px] leading-relaxed text-foreground/80">
          {graph ? (
            <div className="px-2 pb-4">
              <RequisiteDiagram
                academicYear={course.year}
                availableCourseCodes={available}
                code={course.code}
                expression={course.prerequisiteRule}
                hasPrerequisiteWording={course.hasPrerequisiteWording}
                student={student}
                unlocks={course.unlocks}
                unlocksAreKnown={course.unlocksAreKnown}
              />
            </div>
          ) : (
            <EnrolmentSteps
              academicYear={course.year}
              availableCourseCodes={available}
              expression={course.enrolmentRule}
              student={student}
            />
          )}
        </LandingFit>
      </div>
    </div>
  );
}
