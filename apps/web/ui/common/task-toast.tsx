"use client";

import { Progress } from "@coursemap/ui/primitives/progress";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { TOAST_DURATION, ToastDetail } from "@/ui/common/toast";

export type TaskStep = {
  /** Where the work has actually reached, 0-100. The bar catches up to it. */
  percent: number;
  /**
   * Where this phase ends, which is where the next one begins. Once the bar
   * has caught up it drifts towards this for as long as the phase lasts, so
   * the movement is continuous without ever claiming unreported progress.
   */
  ceiling: number;
  /** What the work is doing now, shown above the bar. */
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

/** How often the bar is redrawn while work runs. */
const TICK_MS = 90;

/**
 * The share of the distance each tick closes while the bar is behind what the
 * work has reported. Brisk enough to feel answered, slow enough to read as
 * movement rather than a jump.
 */
const CATCH_UP = 0.18;

/**
 * The least the bar moves per tick while catching up. Easing alone only ever
 * approaches what was reported, which would strand the bar just short of it
 * and never hand over to the drift.
 */
const MIN_CATCH = 0.35;

/**
 * The share closed each tick while the bar is merely waiting out a phase. It
 * approaches the end of the phase without arriving, easing off as it goes.
 */
const DRIFT = 0.008;

/** Below this the bar has settled into its phase and repainting only churns. */
const STILL = 0.05;

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
 * The toast body while work runs: the step the work has reached with how far
 * along it is, over a thin bar. The step is one line so the toast keeps the
 * same height from start to finish.
 */
function TaskProgress({
  percent,
  detail,
}: {
  percent: number;
  detail: string;
}) {
  return (
    <div className="mt-0.5 flex w-full flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate" title={detail}>
          {detail}
        </span>
        <span className="shrink-0 text-xs tabular-nums">
          {Math.round(percent)}%
        </span>
      </div>
      {/* The track is drawn against the toast, not the page, so it needs a
          ground of its own to show how much of the work is left. */}
      <Progress
        value={percent}
        aria-label={detail}
        className="h-1 bg-foreground/10"
      />
    </div>
  );
}

/**
 * Opens one progress toast for a long-running operation and returns the handle
 * that drives it. The `id` is the operation rather than the click, so starting
 * the same work again replaces its toast instead of stacking another one.
 *
 * Phases arrive whenever the work reports them, which for a cached or empty
 * step is no time at all. The bar therefore catches up to what was reported
 * and then drifts through the rest of the phase, so the reported progress
 * stays honest while the movement stays readable.
 */
export function startTask({
  id,
  title,
  detail,
  ceiling = 20,
}: {
  id: string;
  title: string;
  detail: string;
  ceiling?: number;
}): TaskHandle {
  const openedAt = Date.now();
  let shown = 0;
  let floor = 0;
  let limit = ceiling;
  let text = detail;
  let steppedAt = Date.now();
  let timer: number | undefined;
  let settled = false;
  let dismissed = false;

  function paint() {
    // Not toast.loading: sonner withholds the close button from a loading
    // toast, and work that carries on server-side has to be dismissable.
    toast(title, {
      id,
      icon: <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />,
      description: <TaskProgress percent={shown} detail={text} />,
      duration: Number.POSITIVE_INFINITY,
      onDismiss: () => {
        dismissed = true;
        stopGlide();
      },
    });
  }

  function stopGlide() {
    if (timer === undefined) return;
    window.clearInterval(timer);
    timer = undefined;
  }

  function glide() {
    if (Date.now() - steppedAt > STALL_MS) {
      abandon({
        title,
        detail: "Still running. Reload later to check on it.",
      });
      return;
    }
    if (shown < floor) {
      shown = Math.min(
        floor,
        shown + Math.max(MIN_CATCH, (floor - shown) * CATCH_UP),
      );
      paint();
      return;
    }
    const next = shown + (limit - shown) * DRIFT;
    if (next - shown < STILL) return;
    shown = next;
    paint();
  }

  function step({ percent, ceiling: end, detail: line }: TaskStep) {
    if (settled || dismissed) return;
    steppedAt = Date.now();
    floor = Math.max(floor, percent);
    limit = Math.max(limit, end);
    text = line;
    // The wording is what the reader is waiting on, so it lands at once while
    // the bar catches up behind it.
    paint();
    if (timer === undefined) timer = window.setInterval(glide, TICK_MS);
  }

  function settle(kind: "done" | "note" | "fail", outcome: TaskOutcome) {
    if (settled) return;
    settled = true;
    stopGlide();
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

  paint();
  timer = window.setInterval(glide, TICK_MS);

  return {
    step,
    done: (outcome) => settle("done", outcome),
    note: (outcome) => settle("note", outcome),
    fail: (outcome) => settle("fail", outcome),
    abandon,
  };
}
