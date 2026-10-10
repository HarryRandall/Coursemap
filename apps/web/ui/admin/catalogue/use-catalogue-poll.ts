"use client";

import { useEffect, useRef, useState } from "react";

const INITIAL_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;
const POLL_CEILING_MS = 10 * 60 * 1000;

type PollResult = { changed: boolean; done: boolean };

/** Serial, visible-tab polling. Unchanged results back off; each watch is bounded. */
export function useCataloguePoll({
  watchKey,
  enabled,
  initialDelayMs = INITIAL_DELAY_MS,
  poll,
  onError,
}: {
  watchKey: string | null;
  enabled: boolean;
  initialDelayMs?: number;
  poll: (signal: AbortSignal) => Promise<PollResult>;
  onError: (error: unknown) => void;
}) {
  const callbacks = useRef({ poll, onError });
  useEffect(() => {
    callbacks.current = { poll, onError };
  });
  // This guard survives effect restarts, including a change of the selected run.
  const inFlight = useRef(false);
  const waitingCheck = useRef<(() => void) | null>(null);
  const [stoppedKey, setStoppedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !watchKey) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let delayMs = INITIAL_DELAY_MS;
    let done = false;
    const deadline = Date.now() + POLL_CEILING_MS;
    const ceilingTimer = setTimeout(() => {
      done = true;
      clearTimeout(timer);
      controller.abort();
      setStoppedKey(watchKey);
    }, POLL_CEILING_MS);
    function schedule(delay: number) {
      clearTimeout(timer);
      timer = setTimeout(
        check,
        Math.min(delay, Math.max(0, deadline - Date.now())),
      );
    }
    async function check() {
      clearTimeout(timer);
      if (controller.signal.aborted || done) return;
      if (Date.now() >= deadline) {
        done = true;
        clearTimeout(ceilingTimer);
        setStoppedKey(watchKey);
        return;
      }
      if (document.visibilityState !== "visible") {
        schedule(delayMs);
        return;
      }
      if (inFlight.current) {
        waitingCheck.current = check;
        schedule(delayMs);
        return;
      }
      inFlight.current = true;
      try {
        const result = await callbacks.current.poll(controller.signal);
        if (controller.signal.aborted) return;
        done = result.done;
        if (done) clearTimeout(ceilingTimer);
        delayMs = result.changed
          ? INITIAL_DELAY_MS
          : Math.min(delayMs * 2, MAX_DELAY_MS);
      } catch (error) {
        if (controller.signal.aborted) return;
        callbacks.current.onError(error);
        delayMs = Math.min(delayMs * 2, MAX_DELAY_MS);
      } finally {
        inFlight.current = false;
        const waiting = waitingCheck.current;
        waitingCheck.current = null;
        waiting?.();
        if (!controller.signal.aborted && !done) schedule(delayMs);
      }
    }
    function visibilityChanged() {
      clearTimeout(timer);
      if (!done) schedule(delayMs);
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    if (initialDelayMs === 0) void check();
    else schedule(initialDelayMs);
    return () => {
      controller.abort();
      clearTimeout(ceilingTimer);
      if (waitingCheck.current === check) waitingCheck.current = null;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [watchKey, enabled, initialDelayMs]);

  return enabled && stoppedKey !== null && stoppedKey === watchKey;
}
