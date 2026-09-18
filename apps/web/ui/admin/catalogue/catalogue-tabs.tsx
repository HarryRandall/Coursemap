"use client";

import { Tabs, TabsList, TabsTrigger } from "@coursemap/ui/primitives/tabs";
import { usePathname, useRouter } from "next/navigation";

/** Route-backed section tabs so the directory and runs each have a URL. */
export function CatalogueTabs({
  tabs,
  label,
}: {
  tabs: ReadonlyArray<{ href: string; label: string }>;
  label: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const active =
    tabs.find((tab) => pathname === tab.href) ??
    [...tabs]
      .sort((left, right) => right.href.length - left.href.length)
      .find((tab) => pathname.startsWith(tab.href)) ??
    tabs[0];
  return (
    <Tabs
      value={active?.href}
      onValueChange={(href) => router.push(href)}
      className="block"
    >
      <TabsList aria-label={label} variant="line">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
