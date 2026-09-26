"use client";

import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { TOAST_DURATION, ToastDetail } from "@/ui/common/toast";

export type TaskStep = {
  /** What the work is doing now, shown under the title while it runs. */
  detail: string;
};

export type TaskOutcome = {
  title: string;
  detail?: string;
  retry?: () => void;
};

export type TaskHandle = {
  step: (step: TaskStep) => void;
  done: (outcome: TaskOutcome) => void;
  note: (outcome: TaskOutcome) => void;
  fail: (outcome: TaskOutcome) => void;
  /** Let go of work that outlives whatever was watching it. */
  abandon: (outcome: TaskOutcome) => void;
};

/**
 * How long the running toast is held before it may settle. Phases the server
 * answers instantly would otherwise flash past unread.
 */
const MIN_VISIBLE_MS = 800;

/**
 * How long a task may go without a step before it is assumed to have lost
 * whatever was driving it. Both catalogue endpoints cap out at a minute, so
 * anything past this is a driver that stopped reporting, not slow work.
 */
const STALL_MS = 150_000;

/**
 * Opens one toast for a long-running operation and returns the handle that
 * drives it. The `id` is the operation rather than the click, so starting the
 * same work again replaces its toast instead of stacking another one.
 *
 * While the work runs the toast is a spinner, the title and the step it has
 * reached. The steps are reported far too unevenly for a bar to say anything
 * true about how long is left, so none is drawn.
 */
export function startTask({
  id,
  title,
  detail,
}: {
  id: string;
  title: string;
  detail: string;
}): TaskHandle {
  const openedAt = Date.now();
  let stall: number | undefined;
  let settled = false;
  let dismissed = false;

  function paint(line: string) {
    // Not toast.loading: sonner withholds the close button from a loading
    // toast, and work that carries on server-side has to be dismissable.
    toast(title, {
      id,
      icon: <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />,
      description: <ToastDetail text={line} />,
      duration: Number.POSITIVE_INFINITY,
      onDismiss: () => {
        dismissed = true;
        window.clearTimeout(stall);
      },
    });
  }

  function watch() {
    window.clearTimeout(stall);
    stall = window.setTimeout(
      () =>
        abandon({
          title,
          detail: "Still running. Reload later to check on it.",
        }),
      STALL_MS,
    );
  }

  function step({ detail: line }: TaskStep) {
    if (settled || dismissed) return;
    paint(line);
    watch();
  }

  function settle(kind: "done" | "note" | "fail", outcome: TaskOutcome) {
    if (settled) return;
    settled = true;
    window.clearTimeout(stall);
    // A toast dismissed by hand has been read and put away; only a failure is
    // worth bringing back unasked.
    if (dismissed && kind !== "fail") return;
    const show = () => {
      const { title: heading, detail: line, retry } = outcome;
      const tone =
        kind === "done" ? "success" : kind === "note" ? "info" : "error";
      const options = {
        id,
        // Sonner merges into the toast already on screen, so the spinner this
        // task was painted with has to be cleared or it keeps turning under
        // the outcome. Undefined hands the icon back to the toast's own type.
        icon: undefined,
        description: line ? <ToastDetail text={line} /> : undefined,
        // A failure that offers a retry waits for it rather than timing out
        // from under the button.
        duration: retry ? Number.POSITIVE_INFINITY : TOAST_DURATION[tone],
        ...(retry ? { action: { label: "Retry", onClick: retry } } : {}),
      };
      toast[tone](heading, options);
    };
    const held = Date.now() - openedAt;
    if (held >= MIN_VISIBLE_MS) show();
    else window.setTimeout(show, MIN_VISIBLE_MS - held);
  }

  function abandon(outcome: TaskOutcome) {
    settle("note", outcome);
  }

  paint(detail);
  watch();

  return {
    step,
    done: (outcome) => settle("done", outcome),
    note: (outcome) => settle("note", outcome),
    fail: (outcome) => settle("fail", outcome),
    abandon,
  };
}
