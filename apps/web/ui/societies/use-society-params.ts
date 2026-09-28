"use client";

import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

const subscribeToNothing = () => () => {};

/** Retains the server snapshot if browser history changes before hydration. */
export function useSocietyParams(initialQuery: string) {
  const params = useSearchParams();
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  return mounted ? params : new URLSearchParams(initialQuery);
}
