"use client";

import { useEffect, useRef } from "react";
import { useIsMobile } from "@coursemap/ui/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@coursemap/ui/primitives/sheet";
import { useAssistant } from "./assistant-provider";
import { usePathname, useRouter } from "next/navigation";
import { AssistantPanelContent } from "./assistant-panel-content";
import { cn } from "@/lib/cn";
import styles from "./assistant-panel.module.css";

export function AssistantPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const mobile = useIsMobile();
  const panel = useRef<HTMLElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { active, setReturnPath } = useAssistant();
  useEffect(() => {
    if (open && !mobile) panel.current?.focus();
  }, [open, mobile]);
  const content = (
    <AssistantPanelContent
      expanded={false}
      onExpand={() => {
        setReturnPath(pathname);
        router.push(`/compass/${active?.id ?? "new"}`);
      }}
      onClose={onClose}
    />
  );

  if (mobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!open) onClose();
          }}
          showCloseButton={false}
          className="inset-y-0 flex h-dvh w-full max-w-full flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <SheetTitle className="sr-only">Compass</SheetTitle>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className={cn(
        styles.panel,
        "sticky top-0 h-dvh shrink-0 overflow-hidden",
        // The docked panel sits beside the content panel with the same inset,
        // so its open width also carries the right-hand gutter.
        open ? "w-[24.5rem] lg:w-[26.5rem]" : "w-0",
      )}
      inert={!open}
      aria-hidden={!open}
    >
      <aside
        ref={panel}
        tabIndex={-1}
        id="coursemap-assistant"
        aria-label="Compass"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) onClose();
        }}
        className="mt-2 h-[calc(100dvh-1rem)] w-96 overflow-hidden rounded-xl border border-border bg-background shadow-sm outline-none lg:w-[26rem]"
      >
        {content}
      </aside>
    </div>
  );
}
