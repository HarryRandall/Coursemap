"use client";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { cn } from "@/lib/cn";
import ReuiLink from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Plus,
} from "lucide-react";
import type { RefObject } from "react";
import type { Course, Term } from "@/lib/coursemap/types";
import { CourseToken } from "@/ui/common/course-token";

export function CoursePreview({
  course,
  term,
  inPlan,
  adding,
  mobileOpen,
  backButtonRef,
  onBack,
  onAdd,
}: {
  course: Course | null;
  term: Term;
  inPlan: boolean;
  adding: boolean;
  mobileOpen: boolean;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  onAdd: () => void;
}) {
  return (
    <aside
      aria-label="Selected course details"
      className={cn(
        "min-h-0 bg-muted/30",
        course && mobileOpen ? "flex flex-col" : "hidden md:flex md:flex-col",
      )}
    >
      {course ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <button
              ref={backButtonRef}
              type="button"
              onClick={onBack}
              className="mb-2 -ml-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground md:hidden"
            >
              <ArrowLeft size={14} aria-hidden="true" /> Back to results
            </button>
            <div className="flex items-start gap-3">
              <CourseToken
                code={course.code}
                accent={course.accent}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] font-semibold text-muted-foreground">
                  {course.code}
                </p>
                <h3 className="mt-0.5 text-lg leading-tight font-bold tracking-tight text-foreground">
                  {course.name}
                </h3>
              </div>
            </div>

            <p className="mt-4 text-[13px] leading-5 text-muted-foreground">
              {course.description || "No course description is available yet."}
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-4 text-[12px]">
              <div>
                <dt className="text-muted-foreground/80">Units</dt>
                <dd className="mt-0.5 font-medium text-foreground/90">
                  {course.units}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground/80">Level</dt>
                <dd className="mt-0.5 font-medium text-foreground/90">
                  {course.level / 1000}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground/80">Offered</dt>
                <dd className="mt-0.5 font-medium text-foreground/90">
                  {course.sessions.join(", ") || "Not listed"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground/80">Convener</dt>
                <dd className="mt-0.5 truncate font-medium text-foreground/90">
                  {course.convener || "Not listed"}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
                Prerequisites
              </p>
              <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
                {course.prerequisiteText || "No prerequisite listed."}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-end">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-8"
            >
              <ReuiLink
                href={`/courses/${course.year}/${course.code.toLowerCase()}`}
              >
                View course <ExternalLink size={14} aria-hidden="true" />
              </ReuiLink>
            </Button>
            <Button
              variant="default"
              size="sm"
              className="min-h-11 sm:min-h-8"
              disabled={inPlan || adding}
              onClick={onAdd}
              type="button"
            >
              {adding ? (
                <LoaderCircle
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              {inPlan
                ? "Already in plan"
                : adding
                  ? "Adding course"
                  : `Add to ${term.shortName}`}
            </Button>
          </div>
        </>
      ) : (
        <Empty className="!rounded-none">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChevronRight />
            </EmptyMedia>
            <EmptyTitle>Select a course</EmptyTitle>
            <EmptyDescription>
              Review its description, offering and prerequisites before adding
              it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </aside>
  );
}
