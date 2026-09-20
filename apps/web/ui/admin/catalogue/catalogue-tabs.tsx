"use client";

import { Import, LibraryBig } from "lucide-react";
import { Tabs } from "@coursemap/ui/primitives/tabs";
import { usePathname, useRouter } from "next/navigation";

import { SectionTabs } from "@/ui/common/section-tabs";

/**
 * The icons the directory tab bar can show. Naming them here keeps Lucide out
 * of the server component that describes the tabs, and keeps the set closed:
 * a tab bar with an icon per section only reads if the icons are chosen
 * together.
 */
const TAB_ICONS = {
  directory: LibraryBig,
  imports: Import,
} as const;

export type CatalogueTab = {
  href: string;
  icon: keyof typeof TAB_ICONS;
  label: string;
};

/** Route-backed section tabs so the directory and imports each have a URL. */
export function CatalogueTabs({
  tabs,
  label,
}: {
  tabs: readonly CatalogueTab[];
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
      <SectionTabs
        label={label}
        tabs={tabs.map((tab) => {
          const Icon = TAB_ICONS[tab.icon];
          // The label beside it is the accessible name, so the icon is
          // decorative and must not be read out a second time.
          return {
            value: tab.href,
            label: tab.label,
            icon: <Icon aria-hidden="true" size={16} />,
          };
        })}
      />
    </Tabs>
  );
}
