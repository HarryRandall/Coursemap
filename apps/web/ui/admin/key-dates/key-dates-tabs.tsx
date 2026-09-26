"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Tabs } from "@coursemap/ui/primitives/tabs";
import { SectionTabs } from "@/ui/common/section-tabs";
import {
  keyDatesPath,
  keyDatesSectionFromPath,
  type KeyDatesSection,
} from "@/lib/admin/key-dates-sections";
import { routeIcons } from "@/ui/shell/route-icons";

/** Routes the section tabs, so each section has its own address. */
export function KeyDatesTabs({
  children,
  year,
}: {
  children: ReactNode;
  year: number;
}) {
  const router = useRouter();
  const section = keyDatesSectionFromPath(usePathname());
  return (
    <Tabs
      className="block"
      onValueChange={(next) =>
        router.push(keyDatesPath(year, next as KeyDatesSection), {
          scroll: false,
        })
      }
      value={section}
    >
      {children}
    </Tabs>
  );
}

/** `pendingChanges` badges the sync tab while a sync waits for review. */
export function KeyDatesTabList({
  pendingChanges,
}: {
  pendingChanges: number | null;
}) {
  return (
    <SectionTabs
      label="Key dates sections"
      tabs={[
        { value: "dates", label: "Dates", icon: routeIcons["key-dates"] },
        {
          value: "sync",
          label: "Sync",
          icon: routeIcons.sync,
          count: pendingChanges ?? undefined,
        },
        {
          value: "changelog",
          label: "Changelog",
          icon: routeIcons.changelog,
        },
      ]}
    />
  );
}
