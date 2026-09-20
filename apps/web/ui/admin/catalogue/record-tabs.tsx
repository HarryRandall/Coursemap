"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Tabs } from "@coursemap/ui/primitives/tabs";

/**
 * The record page is a server component, so its tab state lives in the URL.
 * An uncontrolled `Tabs` kept its own state instead, which meant the editor's
 * redirect to the preview after a save re-rendered the same instance and the
 * tab never moved. Controlling the value from the query string also keeps a
 * reloaded or shared link on the tab the reader expects.
 */
export function RecordTabs({
  value,
  path,
  children,
}: {
  value: string;
  path: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Tabs
      value={value}
      onValueChange={(next) => router.replace(`${path}&tab=${next}`)}
      className="block"
    >
      {children}
    </Tabs>
  );
}
