"use client";
import { toast } from "sonner";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@coursemap/ui/primitives/dialog";
import { useCoursemap } from "@/app/providers";
import { AppShell } from "@/ui/shell";
import { OnboardingPrompt } from "@/ui/common/onboarding-prompt";
import { ResultsEmptyState } from "@/ui/academic/results-empty-state";
import { PreviewLayout } from "@/ui/academic/previews/preview-layout";
import { PreviewMarkEntry } from "@/ui/academic/previews/preview-mark-entry";
import {
  specialResults,
  type PreviewCourse,
  type PreviewResult,
} from "@/ui/academic/previews/preview-data";
import { saveAcademicResult } from "@/lib/academic/actions";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import {
  planTimelineTerms,
  planTimelineYears,
} from "@/lib/coursemap/plan-timeline";
import { planningCourseForAttempt, unitsForAttempt } from "@/lib/planner";

export function AcademicRecord({ catalogue }: { catalogue: PlanCatalogue }) {
  const { state, notify } = useCoursemap();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const courses = useMemo<PreviewCourse[]>(() => {
    const degree = catalogue.degrees.find(
      (item) => item.code === state.profile.degreeCode,
    );
    const years = planTimelineYears({
      degree,
      commencementYear: state.profile.commencementYear,
      extensionYears: state.profile.extensionYears,
    });
    const terms = planTimelineTerms({ terms: catalogue.terms, years });
    const planning = { ...catalogue, terms };
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentFallback = `${now.getFullYear()}-s${now.getMonth() < 6 ? 1 : 2}`;
    return state.attempts.flatMap((attempt) => {
      const term = terms.find((item) => item.id === attempt.termId);
      const current =
        term?.startsOn && term.endsOn
          ? term.startsOn <= today && today <= term.endsOn
          : attempt.termId === currentFallback;
      if (attempt.status === "planned" && !current) return [];
      const course = planningCourseForAttempt(attempt, planning);
      if (!course) return [];
      const resultCode = specialResults.find(
        (item) => item.value === attempt.resultCode,
      )?.value;
      const semester = attempt.termId.match(/^(\d{4})-s([12])$/);
      return [
        {
          id: attempt.id,
          code: course.code,
          name: course.name,
          units: unitsForAttempt(attempt, course),
          term: attempt.termId,
          termLabel: semester
            ? `Sem ${semester[2]} ${semester[1].slice(2)}`
            : term
              ? `${term.shortName} ${String(term.year).slice(2)}`
              : "Unscheduled",
          mark: attempt.mark,
          resultCode,
          current: Boolean(current),
        },
      ];
    });
  }, [catalogue, state]);
  const course = courses.find((item) => item.id === selected);
  function mutate(
    id: string,
    operation: "save" | "clear" | "remove",
    result?: PreviewResult,
  ) {
    if (pending) return;
    startTransition(async () => {
      try {
        const response = await saveAcademicResult(
          id,
          operation,
          result?.mark,
          result?.resultCode,
          courses.find((item) => item.id === id)?.units,
        );
        if (!response.ok) {
          setSelected(null);
          toast.error(response.message, {
            description: response.detail ? (
              <span className="line-clamp-1 break-all">{response.detail}</span>
            ) : undefined,
          });
          return;
        }
        setSelected(null);
        notify(response.message);
        router.refresh();
      } catch {
        setSelected(null);
        notify("We couldn't save that result. Try again.", "error");
      }
    });
  }
  return (
    <AppShell fill>
      <h1 className="sr-only">Academic history</h1>
      <div aria-busy={pending} className="workspace-stack academic-workspace">
        <PreviewLayout
          design="3"
          live
          courses={courses}
          placeholder={
            state.profile.degreeCode ? (
              <ResultsEmptyState />
            ) : (
              <OnboardingPrompt />
            )
          }
          onSelect={(id) => {
            setSelected(id);
          }}
          onAction={(id, action) => mutate(id, action)}
        />
      </div>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setSelected(null);
        }}
      >
        {selected !== null ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{course?.name ?? "Record result"}</DialogTitle>
              <DialogDescription>
                {course?.code} · {course?.units} units
              </DialogDescription>
            </DialogHeader>
            <PreviewMarkEntry
              key={selected}
              courses={course ? [course] : []}
              pending={pending}
              onCancel={() => setSelected(null)}
              onRecord={(id, result) => mutate(id, "save", result)}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </AppShell>
  );
}
