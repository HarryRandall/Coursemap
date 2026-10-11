"use client";
import { usePublishedSurvey } from "@/lib/course-surveys/use-published-survey";
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
import { YearPicker } from "@/ui/common/year-picker";

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
  const survey = usePublishedSurvey(course.code);
  const { state, addCourse, notify } = useCoursemap();
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

  // The review tab joins the strip only once a report has arrived, so a
  // course without surveys never shows it and then takes it away. A reader
  // who linked straight to the tab keeps it while the report loads or fails.
  const showStudentReview =
    survey.status === "ready" ||
    (activeTab === "student-review" && survey.status !== "empty");

  return (
    <Tabs
      value={
        activeTab === "student-review" && survey.status === "empty"
          ? "overview"
          : activeTab
      }
      onValueChange={(value) => selectTab(value as CourseTab)}
      className="gap-0"
    >
      <AppShell
        tabs={<CourseDetailTabsList showStudentReview={showStudentReview} />}
      >
        <CourseDetailView
          attempts={state.attempts}
          bypassed={Boolean(
            state.courseOverrides?.some(
              (item) => item.courseCode === course.code,
            ),
          )}
          commencementYear={state.profile.commencementYear}
          course={course}
          survey={survey}
          onAddToPlan={() => setPlanOpen(true)}
          onAddToPeriod={async (termId) => {
            const result = await addCourse(course.code, termId, course.year);
            notify(result.message, result.ok ? "success" : "warning");
          }}
          requisiteCompletion={requisiteCompletion}
          yearPicker={
            <YearPicker
              value={course.year}
              years={availableYears}
              onChange={(year) => {
                if (year === "all") return;
                const tab = searchParams.get("tab");
                const suffix = tab ? `?tab=${encodeURIComponent(tab)}` : "";
                router.push(
                  `/courses/${year}/${course.code.toLowerCase()}${suffix}`,
                );
              }}
            />
          }
        />
        {planOpen ? (
          <TermChooser course={course} onClose={() => setPlanOpen(false)} />
        ) : null}
      </AppShell>
    </Tabs>
  );
}
