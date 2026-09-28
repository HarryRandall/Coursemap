"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ScrollArea } from "@coursemap/ui/primitives/scroll-area";
import { SidebarContent } from "@coursemap/ui/primitives/sidebar";

/** Fades only the edges with navigation still outside the visible area. */
export function SidebarScrollContent({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = scrollRef.current;
    const scroll = frame?.querySelector<HTMLDivElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    const content = contentRef.current;
    if (!frame || !scroll || !content) return;

    function updateEdges() {
      if (!frame || !scroll) return;
      // Allow for fractional offsets at the end of a scroll on scaled displays.
      frame.dataset.scrollTop = String(scroll.scrollTop > 1);
      frame.dataset.scrollBottom = String(
        scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 1,
      );
    }

    const observer = new ResizeObserver(updateEdges);
    observer.observe(scroll);
    observer.observe(content);
    scroll.addEventListener("scroll", updateEdges, { passive: true });
    updateEdges();
    return () => {
      observer.disconnect();
      scroll.removeEventListener("scroll", updateEdges);
    };
  }, []);

  return (
    <SidebarContent
      ref={scrollRef}
      className="sidebar-scroll-content overflow-hidden md:-mr-1.5 md:group-data-[collapsible=icon]:mr-0"
    >
      <ScrollArea type="hover" scrollHideDelay={600} className="min-h-0 flex-1">
        <div
          ref={contentRef}
          className="flex flex-col gap-2 pr-3 group-data-[collapsible=icon]:pr-0"
        >
          {children}
        </div>
      </ScrollArea>
    </SidebarContent>
  );
}
