"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The rendered size of an element, following resizes. Until the first
 * measurement it reports `fallback`, so server and first client render agree.
 */
export function useElementSize<T extends HTMLElement>(fallback: {
  width: number;
  height: number;
}) {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
