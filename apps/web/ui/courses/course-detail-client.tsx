"use client";
import { Tabs } from "@coursemap/ui/primitives/tabs";

import { useSearchParams } from "next/navigation";
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
  requisiteCompletion,
}: {
  course: CourseDetails;
  requisiteCompletion: {
    completedCourses: CompletedRequisiteCourse[];
    enrolledProgrammeCodes?: string[];
    isAuthenticated: boolean;
  };
}) {
  const { state } = useCoursemap();
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
