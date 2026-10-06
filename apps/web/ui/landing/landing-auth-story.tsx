"use client";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { ShowcaseCourse } from "@/lib/coursemap/landing-courses";
import { LandingCourseShowcase } from "@/ui/landing/landing-course-showcase";
import { LandingFit } from "@/ui/landing/landing-fit";
import { LandingPlanLoop } from "@/ui/landing/landing-plan-loop";

const SCENES = ["Plan a year", "Check prerequisites"] as const;
/** How long one scene takes to scroll away as the next arrives. */
const SCROLL_MS = 900;

type Story = {
  round: number;
  /** The round scrolling away, while the next one arrives. */
  leaving: number | null;
};

/**
 * The sign-in pages' side panel: a year planning itself, then the
 * prerequisite examples, back and forth. Each change scrolls the whole
 * panel: the finished scene leaves through the top as the next rises from
 * the bottom. Scenes fill the panel's frame and shrink to fit it, so the
 * page's height comes from the form alone.
 * Without courses it stays on the plan.
 */
export function LandingAuthStory({
  courses,
}: {
  courses: readonly ShowcaseCourse[];
}) {
  const [story, setStory] = useState<Story>({ round: 0, leaving: null });
  const scenes = courses.length > 0 ? SCENES.length : 1;
  const next = useCallback(
    () =>
      setStory((current) => ({
        round: current.round + 1,
        leaving: current.round,
      })),
    [],
  );

  useEffect(() => {
    if (story.leaving === null) return;
    const timer = window.setTimeout(
      () => setStory((current) => ({ ...current, leaving: null })),
      SCROLL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [story.leaving]);

  const rounds =
    story.leaving === null ? [story.round] : [story.leaving, story.round];

  return (
    <div className="absolute inset-0 overflow-hidden">
      {rounds.map((round) => {
        const scene = round % scenes;
        const outgoing = round === story.leaving;
        return (
          <div
            key={round}
            className={cn(
              "absolute inset-0 flex flex-col",
              story.leaving !== null &&
                (outgoing
                  ? "animate-[landing-scene-out_900ms_cubic-bezier(0.65,0,0.35,1)_forwards]"
                  : "animate-[landing-scene-in_900ms_cubic-bezier(0.65,0,0.35,1)]"),
            )}
          >
            <p className="mb-3 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              {SCENES[scene]}
            </p>
            <LandingFit className="min-h-0 flex-1">
              {scene === 0 ? (
                <LandingPlanLoop
                  startYear={Math.floor(round / scenes)}
                  onFinished={scenes > 1 && !outgoing ? next : undefined}
                />
              ) : (
                <LandingCourseShowcase
                  courses={courses}
                  onFinished={outgoing ? undefined : next}
                />
              )}
            </LandingFit>
          </div>
        );
      })}
    </div>
  );
}
