"use client";
import { Tabs } from "@coursemap/ui/primitives/tabs";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCoursemap } from "@/app/providers";
import {
  CourseDetailTabsList,
  CourseDetailView,
  courseTabFromSearch,
  type CourseTab,
} from "@/ui/courses/course-detail-view";
import { TermChooser } from "@/ui/overlays";
import { AppShell } from "@/ui/shell";

import type { CourseDetails } from "@/lib/coursemap/course-types";
import type { CompletedRequisiteCourse } from "@/lib/coursemap/requisite-summary";

export function CourseDetailClient({
  course,
  availableYears,
  requisiteCompletion,
}: {
  course: CourseDetails;
  availableYears: number[];
  requisiteCompletion: {
    completedCourses: CompletedRequisiteCourse[];
    enrolledProgrammeCodes?: string[];
    isAuthenticated: boolean;
  };
}) {
  const { state } = useCoursemap();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<CourseTab>(() =>
    courseTabFromSearch(searchParams.get("tab")),
  );
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    const syncTabFromHistory = () => {
      setActiveTab(
        courseTabFromSearch(
          new URL(window.location.href).searchParams.get("tab"),
        ),
      );
    };
    window.addEventListener("popstate", syncTabFromHistory);
    return () => window.removeEventListener("popstate", syncTabFromHistory);
  }, []);

  const selectTab = (tab: CourseTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => selectTab(value as CourseTab)}
      className="gap-0"
    >
      <AppShell tabs={<CourseDetailTabsList />}>
        <div className="mb-4 flex items-center justify-end gap-2">
          <label
            htmlFor="course-academic-year"
            className="text-sm text-muted-foreground"
          >
            Academic year
          </label>
          <select
            id="course-academic-year"
            aria-label="Academic year"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            value={course.year}
            onChange={(event) => {
              const tab = searchParams.get("tab");
              const suffix = tab ? `?tab=${encodeURIComponent(tab)}` : "";
              router.push(
                `/courses/${event.target.value}/${course.code.toLowerCase()}${suffix}`,
              );
            }}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <CourseDetailView
          attempts={state.attempts}
          commencementYear={state.profile.commencementYear}
          course={course}
          onAddToPlan={() => setPlanOpen(true)}
          requisiteCompletion={requisiteCompletion}
        />
        {planOpen ? (
          <TermChooser course={course} onClose={() => setPlanOpen(false)} />
        ) : null}
      </AppShell>
    </Tabs>
  );
}
