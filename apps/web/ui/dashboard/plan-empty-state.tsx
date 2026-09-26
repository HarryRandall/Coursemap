"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";

const edgeTransition = {
  duration: 0.7,
  ease: "easeInOut" as const,
};

/**
 * A prerequisite chain: two completed courses feeding the course the student
 * picks next. It shows what Coursemap does before any data exists. The
 * sequence (nodes appear, edges draw, the next course unlocks and pulses)
 * fades out and replays on a slow cycle. Everything renders in its final
 * state when the visitor prefers reduced motion.
 */
function PlanIllustration({ reduceMotion }: { reduceMotion: boolean }) {
  const appear = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, scale: 0.92 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: 0.45, delay, ease: "easeOut" as const },
        };

  const draw = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { ...edgeTransition, delay },
        };

  return (
    <svg
      width="220"
      height="120"
      viewBox="0 0 220 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Completed course nodes */}
      <motion.g {...appear(0)}>
        <rect
          x="12"
          y="16"
          width="64"
          height="28"
          rx="8"
          className="fill-muted stroke-border"
          strokeWidth="1.5"
        />
        <circle cx="26" cy="30" r="4" className="fill-primary/50" />
        <rect
          x="36"
          y="27"
          width="30"
          height="6"
          rx="3"
          className="fill-muted-foreground/30"
        />
      </motion.g>

      <motion.g {...appear(0.15)}>
        <rect
          x="12"
          y="76"
          width="64"
          height="28"
          rx="8"
          className="fill-muted stroke-border"
          strokeWidth="1.5"
        />
        <circle cx="26" cy="90" r="4" className="fill-primary/50" />
        <rect
          x="36"
          y="87"
          width="30"
          height="6"
          rx="3"
          className="fill-muted-foreground/30"
        />
      </motion.g>

      {/* Prerequisite edges into the next course */}
      <motion.path
        d="M76 30 Q104 30 118 52"
        className="stroke-muted-foreground/40"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        {...draw(0.5)}
      />
      <motion.path
        d="M76 90 Q104 90 118 68"
        className="stroke-muted-foreground/40"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        {...draw(0.6)}
      />

      {/* The course being unlocked */}
      <motion.g {...appear(1.05)}>
        <rect
          x="122"
          y="44"
          width="72"
          height="32"
          rx="9"
          className="fill-primary/5 stroke-primary/60 dark:fill-primary/10"
          strokeWidth="2"
        />
        <motion.circle
          cx="138"
          cy="60"
          r="5"
          className="fill-primary"
          {...(reduceMotion
            ? {}
            : {
                animate: { scale: [1, 1.3, 1] },
                transition: {
                  duration: 1.4,
                  delay: 1.8,
                  repeat: Infinity,
                  repeatDelay: 1.6,
                  ease: "easeInOut" as const,
                },
                style: { transformOrigin: "138px 60px" },
              })}
        />
        <rect
          x="150"
          y="57"
          width="34"
          height="6"
          rx="3"
          className="fill-primary/40"
        />
      </motion.g>

      {/* The path continuing beyond it */}
      <motion.g {...appear(1.35)}>
        <path
          d="M194 60 L206 60"
          className="stroke-muted-foreground/30"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 5"
        />
        <circle cx="212" cy="60" r="2.5" className="fill-muted-foreground/25" />
      </motion.g>
    </svg>
  );
}

/** Replays the illustration on a slow cycle with a soft cross-fade. */
function LoopingPlanIllustration() {
  const reduceMotion = useReducedMotion() ?? false;
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(() => setCycle((count) => count + 1), 7200);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  if (reduceMotion) {
    return <PlanIllustration reduceMotion />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={cycle}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeIn" }}
      >
        <PlanIllustration reduceMotion={false} />
      </motion.div>
    </AnimatePresence>
  );
}

export function PlanEmptyState() {
  return (
    <Empty className="h-full min-h-[70vh] w-full rounded-xl border px-6 py-16 md:min-h-0">
      <EmptyHeader>
        <EmptyMedia>
          <LoopingPlanIllustration />
        </EmptyMedia>
        <EmptyTitle>Set up your plan first</EmptyTitle>
        <EmptyDescription>
          Choose a degree before Coursemap can calculate your progress.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/onboarding">Start onboarding</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}
