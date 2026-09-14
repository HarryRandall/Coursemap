"use client";
import { useEffect, useRef } from "react";

/** Saves a settled edit once; failed edits remain available for explicit retry. */
export function useCatalogueAutosave(
  value: unknown,
  enabled: boolean,
  save: () => Promise<void>,
) {
  const signature = JSON.stringify(value);
  const previous = useRef(signature);
  const wasEnabled = useRef(false);
  const callback = useRef(save);
  const pending = useRef(Promise.resolve());
  useEffect(() => {
    callback.current = save;
  });
  useEffect(() => {
    if (!enabled || !wasEnabled.current) {
      wasEnabled.current = enabled;
      previous.current = signature;
      return;
    }
    if (signature === previous.current) return;
    const timer = setTimeout(() => {
      previous.current = signature;
      pending.current = pending.current
        .then(() => callback.current())
        .catch(() => undefined);
    }, 1200);
    return () => clearTimeout(timer);
  }, [signature, enabled]);
}
