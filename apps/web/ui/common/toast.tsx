"use client";

import { toast, type ExternalToast } from "sonner";

export type ToastTone = "success" | "info" | "warning" | "error";

/**
 * How long each kind of toast stays. Confirmations only need a glance, while a
 * warning or error usually carries something to act on.
 */
export const TOAST_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

/**
 * The line under a toast's title. It is clamped so a toast never grows past
 * two lines of detail, and the whole text is kept in the tooltip.
 */
export function ToastDetail({ text }: { text: string }) {
  return (
    <span className="line-clamp-2" title={text}>
      {text}
    </span>
  );
}

/**
 * Splits a message into a short title and the detail under it. Messages often
 * arrive as a sentence of what happened followed by what to do about it, and
 * as one run of text they wrap into a paragraph. Titles carry no full stop so
 * every toast reads the same whether its message had one or not.
 */
export function toastParts(message: string, detail?: string) {
  const text = message.trim();
  const split = detail ? null : /^([^]+?[.!?])\s+(\S[^]*)$/.exec(text);
  const title = (split?.[1] ?? text).replace(/\.$/, "");
  return { title, detail: detail ?? split?.[2] };
}

/** Shows one toast with the house title and detail layout. */
export function showToast(
  message: string,
  tone: ToastTone = "success",
  options: Omit<ExternalToast, "description"> & { detail?: string } = {},
) {
  const { detail: suppliedDetail, ...rest } = options;
  const { title, detail } = toastParts(message, suppliedDetail);
  return toast[tone](title, {
    duration: TOAST_DURATION[tone],
    ...(detail ? { description: <ToastDetail text={detail} /> } : {}),
    ...rest,
  });
}
