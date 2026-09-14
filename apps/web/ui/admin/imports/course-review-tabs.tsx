"use client";

import { TabsList, TabsTrigger } from "@coursemap/ui/primitives/tabs";

const courseReviewTabs = [
  { value: "review", label: "Review" },
  { value: "history", label: "History" },
  { value: "preview", label: "Preview" },
] as const;

export function CourseReviewTabs({
  hasData = true,
  editing = false,
  activeTab,
}: {
  hasData?: boolean;
  editing?: boolean;
  activeTab: string;
}) {
  return (
    <TabsList variant="line" aria-label="Course views">
      {courseReviewTabs.map((tab) => (
        <TabsTrigger
          key={tab.value}
          value={tab.value}
          disabled={
            (editing && tab.value !== activeTab) ||
            (!hasData && tab.value === "preview")
          }
        >
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
