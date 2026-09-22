"use client";

import { Tabs } from "@coursemap/ui/primitives/tabs";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SectionTabs } from "@/ui/common/section-tabs";
import { routeIcons } from "@/ui/shell/route-icons";

export type RecordSection =
  "content" | "student-view" | "changes" | "changelog";

export function RecordTabs({
  value,
  path,
  children,
}: {
  value: RecordSection;
  path: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Tabs
      value={value}
      onValueChange={(next) =>
        router.push(next === "content" ? path : `${path}/${next}`)
      }
      className="block"
    >
      {children}
    </Tabs>
  );
}

export function RecordTabList({ changeCount = 0 }: { changeCount?: number }) {
  return (
    <SectionTabs
      label="Record sections"
      tabs={[
        { value: "content", label: "Content", icon: routeIcons.content },
        {
          value: "student-view",
          label: "Student view",
          icon: routeIcons["student-view"],
        },
        {
          value: "changes",
          label: "Changes",
          icon: routeIcons.changes,
          count: changeCount,
        },
        { value: "changelog", label: "Changelog", icon: routeIcons.changelog },
      ]}
    />
  );
}
