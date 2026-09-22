"use client";

import { Tabs } from "@coursemap/ui/primitives/tabs";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ADMIN_CATALOGUE_OPERATIONS_PATH } from "@/lib/coursemap/catalogue-kinds";
import { SectionTabs } from "@/ui/common/section-tabs";
import { routeIcons } from "@/ui/shell/route-icons";

export type OperationsSection = "syncs" | "discovery";

export function OperationsTabs({
  value,
  children,
}: {
  value: OperationsSection;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Tabs
      className="block"
      onValueChange={(next) =>
        router.push(
          next === "syncs"
            ? ADMIN_CATALOGUE_OPERATIONS_PATH
            : `${ADMIN_CATALOGUE_OPERATIONS_PATH}/${next}`,
        )
      }
      value={value}
    >
      {children}
    </Tabs>
  );
}

export function OperationsTabList() {
  return (
    <SectionTabs
      label="Catalogue activity"
      tabs={[
        { value: "syncs", label: "Syncs", icon: routeIcons.syncs },
        { value: "discovery", label: "Discovery", icon: routeIcons.discovery },
      ]}
    />
  );
}
