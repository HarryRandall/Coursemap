"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@coursemap/ui/components/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";

export function StudyPeriodOverflow({ periods }: { periods: string[] }) {
  const [mode, setMode] = useState<"preview" | "active" | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreFocus = useRef(false);
  const returningFocus = useRef(false);

  function cancelClose() {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  function preview() {
    cancelClose();
    if (!returningFocus.current) setMode((current) => current ?? "preview");
  }

  function closePreview() {
    cancelClose();
    // Leave time to cross the gap between the trigger and its portalled list.
    closeTimer.current = setTimeout(() => {
      setMode((current) => (current === "preview" ? null : current));
    }, 150);
  }

  useEffect(
    () => () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <Popover
      open={mode !== null}
      onOpenChange={(open) => setMode(open ? "active" : null)}
    >
      <PopoverTrigger asChild>
        <Badge asChild variant="outline">
          <button
            ref={triggerRef}
            type="button"
            className="hover:bg-accent hover:text-accent-foreground"
            aria-label={`Show ${periods.length} more available study periods`}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") preview();
            }}
            onPointerLeave={() => {
              if (document.activeElement !== triggerRef.current) closePreview();
            }}
            onFocus={preview}
            onBlur={(event) => {
              if (!contentRef.current?.contains(event.relatedTarget))
                closePreview();
            }}
            onClick={(event) => {
              // Hover or focus may already have opened a preview. Activation
              // keeps it open instead of letting the trigger toggle it closed.
              event.preventDefault();
              cancelClose();
              restoreFocus.current = mode === "active";
              setMode(mode === "active" ? null : "active");
              if (mode === "preview") contentRef.current?.focus();
            }}
          >
            +{periods.length}
          </button>
        </Badge>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        aria-label="More available study periods"
        side="bottom"
        align="start"
        collisionPadding={8}
        className="w-max max-w-[calc(100vw-2rem)]"
        onPointerEnter={cancelClose}
        onPointerLeave={() => {
          if (!contentRef.current?.contains(document.activeElement))
            closePreview();
        }}
        onOpenAutoFocus={(event) => {
          if (mode === "preview") event.preventDefault();
        }}
        onEscapeKeyDown={() => {
          restoreFocus.current = true;
        }}
        onInteractOutside={() => {
          restoreFocus.current = false;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (restoreFocus.current) {
            // Returning focus must not immediately reopen the focus preview.
            returningFocus.current = true;
            triggerRef.current?.focus();
            returningFocus.current = false;
            restoreFocus.current = false;
          }
        }}
      >
        <ul className="space-y-1">
          {periods.map((period) => (
            <li key={period}>{period}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
