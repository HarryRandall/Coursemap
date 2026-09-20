"use client";

import { Tabs } from "@coursemap/ui/primitives/tabs";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { Course } from "@/lib/coursemap/types";
import type { StructureDetails } from "@/lib/coursemap/structure-types";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import {
  StructureDetailTabsList,
  StructureDetailView,
  structureTabFromSearch,
  type StructureTab,
} from "@/ui/requirements/structure-detail-view";
import { AppShell } from "@/ui/shell";

export function StructureDetailClient({
  structure,
  courses,
}: {
  structure: StructureDetails;
  courses: Course[];
}) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<StructureTab>(() =>
    structureTabFromSearch(searchParams.get("tab")),
  );

  useEffect(() => {
    const syncTabFromHistory = () => {
      setActiveTab(
        structureTabFromSearch(
          new URL(window.location.href).searchParams.get("tab"),
        ),
      );
    };
    window.addEventListener("popstate", syncTabFromHistory);
    return () => window.removeEventListener("popstate", syncTabFromHistory);
  }, []);

  const selectTab = (tab: StructureTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => selectTab(value as StructureTab)}
      className="gap-0"
    >
      <AppShell
        tabs={<StructureDetailTabsList />}
        breadcrumbSegmentLabels={{ structures: null }}
        currentBreadcrumbLabel={structure.name}
      >
        <StructureDetailView
          structure={structure}
          treeContext={readingTreeContext({
            academicYear: structure.year,
            courses,
            unitTarget: structure.units,
          })}
        />
      </AppShell>
    </Tabs>
  );
}
