"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { AssistantIcon } from "@/ui/assistant/assistant-icon";
import { Button } from "@coursemap/ui/primitives/button";
import { useAssistant } from "@/ui/assistant/assistant-provider";
import { AssistantPanel } from "@/ui/assistant/assistant-panel";
import assistantStyles from "@/ui/assistant/assistant-panel.module.css";
import {
  SidebarInset,
  SidebarProvider,
} from "@coursemap/ui/primitives/sidebar";
import { cn } from "@/lib/cn";
import { AppSidebar } from "@/ui/shell/app-sidebar";
import type { RouteIconKey } from "@/ui/shell/route-icons";
import { useSidebarDefaultOpen } from "@/ui/shell/sidebar-preference";
import { NotificationsMenu } from "@/ui/shell/notifications-menu";
import { Topbar } from "@/ui/shell/topbar";

export type AppShellProps = {
  children: ReactNode;
  actions?: ReactNode;
  /** Section tab links rendered in a full-width bar below the breadcrumbs. */
  tabs?: ReactNode;
  /** Replaces the final generated breadcrumb label when the route needs richer context. */
  currentBreadcrumbLabel?: string;
  /** Relabels generated path segments, or hides them when their value is null. */
  breadcrumbSegmentLabels?: Record<string, string | null>;
  /** Appends the open section, such as the active tab, to the breadcrumb. */
  breadcrumbTrailingLabel?: string;
  /** The appended section's icon, named by the route key its tab uses. */
  breadcrumbTrailingIcon?: RouteIconKey;
  loading?: boolean;
  admin?: boolean;
  /** Makes the main region a flex column so one child can claim the rest of the viewport. */
  fill?: boolean;
  /** Removes the default page padding + max width (used by the plan board). */
  fullBleed?: boolean;
  /** Keeps interactive canvases at the available width while retaining page padding. */
  fullWidth?: boolean;
};

export function AppShell({
  children,
  actions,
  tabs,
  currentBreadcrumbLabel,
  breadcrumbSegmentLabels,
  breadcrumbTrailingLabel,
  breadcrumbTrailingIcon,
  loading = false,
  admin = false,
  fill = false,
  fullBleed = false,
  fullWidth = false,
}: AppShellProps) {
  const { open, setOpen } = useSidebarDefaultOpen();
  const { panelOpen: assistantOpen, setPanelOpen: setAssistantOpen } =
    useAssistant();
  const assistantTrigger = useRef<HTMLButtonElement>(null);
  const restoreAssistantFocus = useRef(false);
  function closeAssistant() {
    restoreAssistantFocus.current = true;
    setAssistantOpen(false);
    if (
      window.matchMedia("(prefers-reduced-motion: reduce), (width < 48rem)")
        .matches
    ) {
      requestAnimationFrame(() => {
        assistantTrigger.current?.focus();
        restoreAssistantFocus.current = false;
      });
    }
  }
  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      // On desktop the shell is exactly one viewport tall and the content
      // panel scrolls, so its scrollbar sits inside the panel rather than at
      // the window edge. Narrow screens keep scrolling the page, which is what
      // a thumb expects.
      className="md:h-dvh md:min-h-0 md:overflow-hidden"
    >
      <AppSidebar admin={admin} />

      <SidebarInset
        // The inset margins come out of the viewport, so the wrapper
        // stretches the panel rather than the panel claiming full height.
        className="min-w-0 md:min-h-0 md:overflow-hidden md:ring-1 md:ring-border"
      >
        <Topbar
          loading={loading}
          actions={
            <>
              {actions}
              <div className="flex items-center">
                <NotificationsMenu />
                <div
                  className={assistantStyles.triggerSlot}
                  data-open={assistantOpen}
                >
                  <Button
                    ref={assistantTrigger}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      assistantStyles.trigger,
                      "group h-10 w-24 rounded-lg hover:bg-accent dark:hover:bg-accent",
                    )}
                    aria-expanded={assistantOpen}
                    onTransitionEnd={(event) => {
                      if (
                        event.target === event.currentTarget &&
                        event.propertyName === "visibility" &&
                        !assistantOpen &&
                        restoreAssistantFocus.current
                      ) {
                        assistantTrigger.current?.focus();
                        restoreAssistantFocus.current = false;
                      }
                    }}
                    onClick={() => {
                      restoreAssistantFocus.current = false;
                      setAssistantOpen(!assistantOpen);
                    }}
                  >
                    <AssistantIcon className="size-4" />
                    Compass
                  </Button>
                </div>
              </div>
            </>
          }
          breadcrumbSegmentLabels={breadcrumbSegmentLabels}
          currentBreadcrumbLabel={currentBreadcrumbLabel}
          breadcrumbTrailingLabel={breadcrumbTrailingLabel}
          breadcrumbTrailingIcon={breadcrumbTrailingIcon}
        />
        {tabs && (
          <div
            className={cn(
              "sticky top-14 z-30 shrink-0 border-b border-border bg-background px-4 sm:px-6",
              fill && "md:shrink-0",
            )}
          >
            <nav
              aria-label="Page sections"
              className="flex min-w-0 items-center overflow-x-auto overflow-y-hidden"
            >
              {tabs}
            </nav>
          </div>
        )}
        <div
          className={cn(
            // A flex column lets an empty state claim the height left below
            // the page's header on any page.
            "flex w-full max-w-none min-w-0 flex-1 flex-col",
            !fullBleed && "page-padded px-4 py-6 sm:px-6 sm:py-7",
            // Lets a page hand its remaining height to one scrolling child,
            // such as a directory table that should reach the viewport floor.
            fill && "min-h-0 md:overflow-hidden",
            // Other pages scroll below the topbar and tabs, so the header
            // never moves and the scrollbar starts under it.
            !fill && "md:min-h-0 md:overflow-y-auto md:overscroll-contain",
          )}
        >
          {fullBleed || fullWidth ? (
            children
          ) : (
            <div
              data-slot="page-content"
              className={cn(
                "mx-auto flex w-full max-w-8xl min-w-0 flex-1 flex-col",
                fill && "min-h-0",
              )}
            >
              {children}
            </div>
          )}
        </div>
      </SidebarInset>
      <AssistantPanel open={assistantOpen} onClose={closeAssistant} />
    </SidebarProvider>
  );
}
