"use client";

import { useEffect, useRef, useState } from "react";

// About 25 words a second: quick enough to keep up with the model, slow
// enough to read as writing rather than a block of text appearing.
const REVEAL_INTERVAL_MS = 40;
// How many intervals a backlog is spread over before it is caught up.
const CATCH_UP_STEPS = 30;

/** The end of the word that follows `from`, `count` words ahead. */
export function nextWordBoundary(text: string, from: number, count: number) {
  const word = /\S+\s*/gu;
  word.lastIndex = from;
  let end = from;
  for (let index = 0; index < count; index += 1) {
    const match = word.exec(text);
    if (!match) return text.length;
    end = word.lastIndex;
  }
  return end;
}

function prefersInstantText() {
  return (
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * How much of `text` to show, advancing a word at a time so a reply reads as
 * if it is being written. Network chunks arrive unevenly; when the reveal
 * falls behind it takes several words per step, so it never lags far behind.
 * Text present when the component mounts without `animate` shows at once.
 */
export function useWordReveal(text: string, animate: boolean) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  const visible = Math.min(shown, text.length);
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  }, [text]);
  const revealing = visible < text.length;
  // One steady clock while there is text to reveal. Streaming chunks change
  // `text` every few milliseconds, so a timer restarted on each change would
  // never fire until the stream ended.
  useEffect(() => {
    if (!revealing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      if (prefersInstantText()) {
        setShown(Number.MAX_SAFE_INTEGER);
        return;
      }
      const now = performance.now();
      // A throttled background tab catches up rather than crawling.
      const steps = Math.max(1, Math.round((now - last) / REVEAL_INTERVAL_MS));
      last = now;
      setShown((current) => {
        const target = latest.current;
        const from = Math.min(current, target.length);
        const backlog = (target.length - from) / 6;
        const words = steps * Math.max(1, Math.round(backlog / CATCH_UP_STEPS));
        return nextWordBoundary(target, from, words);
      });
    }, REVEAL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [revealing]);
  return { text: text.slice(0, visible), revealing };
}
