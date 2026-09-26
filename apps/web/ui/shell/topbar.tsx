"use client";

import type { ReactNode } from "react";
import { Separator } from "@coursemap/ui/primitives/separator";
import { SidebarTrigger } from "@coursemap/ui/primitives/sidebar";
import { cn } from "@/lib/cn";
import type { RouteIconKey } from "@/ui/shell/route-icons";
import { useLoadingProgress } from "./use-loading-progress";
import { Breadcrumbs } from "@/ui/shell/breadcrumbs";

export function Topbar({
  loading = false,
  title,
  actions,
  currentBreadcrumbLabel,
  breadcrumbSegmentLabels,
  breadcrumbTrailingLabel,
  breadcrumbTrailingIcon,
}: {
  loading?: boolean;
  title?: ReactNode;
  actions?: ReactNode;
  currentBreadcrumbLabel?: string;
  breadcrumbSegmentLabels?: Record<string, string | null>;
  breadcrumbTrailingLabel?: string;
  breadcrumbTrailingIcon?: RouteIconKey;
}) {
  const header = useLoadingProgress(loading);
  return (
    <header
      ref={header}
      data-loading={loading || undefined}
      className={cn(
        loading && "topbar-loading",
        "topbar-progress sticky top-0 z-40 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 overflow-visible border-b border-border bg-background px-4 py-2 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-0 md:rounded-t-xl",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-visible">
        <SidebarTrigger className="shrink-0" />
        <Separator
          orientation="vertical"
          className="mr-1 hidden sm:block data-vertical:h-4 data-vertical:self-center"
        />
        {title ?? (
          <Breadcrumbs
            currentLabel={currentBreadcrumbLabel}
            segmentLabels={breadcrumbSegmentLabels}
            trailingLabel={breadcrumbTrailingLabel}
            trailingIcon={breadcrumbTrailingIcon}
          />
        )}
      </div>

      {actions ? (
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
