"use client";

import { useEffect, useState } from "react";

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
  useEffect(() => {
    if (visible >= text.length) return;
    const timer = setTimeout(() => {
      if (prefersInstantText()) {
        setShown(text.length);
        return;
      }
      const backlog = (text.length - visible) / 6;
      setShown(
        nextWordBoundary(
          text,
          visible,
          Math.max(1, Math.round(backlog / CATCH_UP_STEPS)),
        ),
      );
    }, REVEAL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [text, visible]);
  return { text: text.slice(0, visible), revealing: visible < text.length };
}
