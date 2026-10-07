"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileChartColumn, KeyRound } from "lucide-react";
import { Tabs } from "@coursemap/ui/primitives/tabs";
import { SELT_ADMIN_PATH } from "@/lib/selt/admin-format";
import { SectionTabs } from "@/ui/common/section-tabs";

export type SeltSection = "reports" | "access";

export function SeltTabs({
  value,
  children,
}: {
  value: SeltSection;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Tabs
      className="block"
      value={value}
      onValueChange={(next) =>
        router.push(
          next === "reports" ? SELT_ADMIN_PATH : `${SELT_ADMIN_PATH}/${next}`,
        )
      }
    >
      {children}
    </Tabs>
  );
}

export function SeltTabList({ waiting }: { waiting: number }) {
  return (
    <SectionTabs
      label="SELT surveys"
      tabs={[
        {
          value: "reports",
          label: "Reports",
          icon: FileChartColumn,
          count: waiting,
        },
        { value: "access", label: "Import access", icon: KeyRound },
      ]}
    />
  );
}
