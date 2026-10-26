"use client";

import { useEffect, useRef, useState } from "react";

const OPEN_DELAY_MS = 250;
const CLOSE_DELAY_MS = 150;

/**
 * Open and close timing for a preview pane anchored to text, like a page
 * mention in Notion. Resting on or focusing the trigger opens it; moving
 * between trigger and pane keeps it open; scrolling closes it, since the pane
 * belongs to a spot in the text.
 */
export function useHoverPane() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [open]);
  function after(delay: number, next: boolean) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  }
  const pointer = {
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") after(OPEN_DELAY_MS, true);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") after(CLOSE_DELAY_MS, false);
    },
  };
  return {
    open,
    setOpen,
    triggerProps: {
      ...pointer,
      onFocus: () => after(OPEN_DELAY_MS, true),
      onBlur: () => after(CLOSE_DELAY_MS, false),
    },
    paneProps: {
      ...pointer,
      onFocus: () => after(0, true),
      onBlur: () => after(CLOSE_DELAY_MS, false),
      onOpenAutoFocus: (event: Event) => event.preventDefault(),
      onCloseAutoFocus: (event: Event) => event.preventDefault(),
    },
  };
}
