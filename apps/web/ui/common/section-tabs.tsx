"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { TabsList, TabsTrigger } from "@coursemap/ui/primitives/tabs";

export type SectionTab = {
  value: string;
  label: string;
  /**
   * The section's icon, sized here so a bar of tabs stays even. Take it from
   * `routeIcons` wherever the section is also a place in the product, so the
   * tab, the breadcrumb and the sidebar all name it the same way.
   */
  icon?: LucideIcon;
  /** Shown beside the label when the section holds outstanding work. */
  count?: number;
  disabled?: boolean;
};

/**
 * The section tab bar for a page. Hand this to `AppShell`'s `tabs` slot, with
 * the `Tabs` provider wrapping the shell, so the bar always renders directly
 * below the breadcrumb rather than floating in page content.
 *
 * Do not wrap it in a bordered or scrolling container. The shell owns that
 * chrome, and pages that added their own produced a second border and a tab
 * strip that scrolled independently of the page.
 */
export function SectionTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: readonly SectionTab[];
}) {
  return (
    <div className="min-w-max flex-1">
      <TabsList aria-label={label} variant="line">
        {tabs.map((tab) => (
          <TabsTrigger
            className="gap-2"
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
          >
            {tab.icon ? (
              <tab.icon aria-hidden="true" className="size-4" />
            ) : null}
            {tab.label}
            {tab.count ? (
              <Badge size="sm" variant="warning-light">
                {tab.count}
              </Badge>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}

/**
 * A tab bar for sections inside a panel rather than for the page itself, such
 * as the course preview nested in an import review. It carries its own rule
 * because it is not rendered by the shell.
 */
export function PanelTabs({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto overflow-y-hidden border-b border-border">
      <div className="min-w-max">{children}</div>
    </div>
  );
}
