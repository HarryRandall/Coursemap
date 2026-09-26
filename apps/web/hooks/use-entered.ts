"use client";
import { useEffect, useState } from "react";

/**
 * True from the second frame after mount. Entrance animations wait for it
 * (through a `data-entered` attribute) so they play once the page is
 * interactive instead of running out while hydration blocks painting.
 */
export function useEntered() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  return entered;
}
