"use client";

import { Progress } from "@coursemap/ui/primitives/progress";
import { toast } from "sonner";

export type TaskStep = {
  /** Where the work has actually reached, 0-100. The bar never shows less. */
  percent: number;
  /**
   * Where this phase ends, which is where the next one starts. The bar drifts
   * towards it for as long as the phase lasts, so the movement is continuous
   * without ever claiming progress the work has not reported.
   */
  ceiling: number;
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
};

const SETTLED_DURATION = 6000;

/** How often the bar is nudged towards the end of its phase. */
const TICK_MS = 90;

/**
 * The share of the remaining distance each tick closes. The bar therefore
 * approaches the end of a phase without arriving, easing off as it goes, and
 * picks up again the moment the next phase raises the ceiling.
 */
const EASE = 0.06;

/**
 * How long the running toast is held before it may settle. Phases that the
 * server answers instantly would otherwise flash past unread.
 */
const MIN_VISIBLE_MS = 800;

/**
 * The toast body while work runs. It stays the two lines every other toast
 * uses, title then detail, with the bar as a rule beneath them; the button
 * that started the work keeps its own label rather than reflowing the toolbar
 * on every event.
 */
function TaskProgress({ percent, detail }: Omit<TaskStep, "ceiling">) {
  return (
    <div className="mt-1 flex w-full flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate">{detail}</span>
        <span className="shrink-0 tabular-nums">{Math.round(percent)}%</span>
      </div>
      {/* The track is drawn against the toast, not the page, so it needs a
          ground of its own to show how much of the work is left. */}
      <Progress value={percent} className="bg-foreground/15" />
    </div>
  );
}

/**
 * Opens one progress toast for a long-running operation and returns the handle
 * that drives it. The `id` is the operation rather than the click, so starting
 * the same work again replaces its toast instead of stacking another one.
 *
 * Phases arrive whenever the work reports them, which for a cached or empty
 * step is no time at all. The bar therefore tracks the phase as a destination
 * and eases towards it, so the reported progress stays honest while the
 * movement stays readable.
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
  let limit = ceiling;
  let text = detail;
  let timer: number | undefined;
  let settled = false;

  function paint() {
    toast.loading(title, {
      id,
      description: <TaskProgress percent={shown} detail={text} />,
      duration: Number.POSITIVE_INFINITY,
    });
  }

  function stopGlide() {
    if (timer === undefined) return;
    window.clearInterval(timer);
    timer = undefined;
  }

  function glide() {
    const next = shown + (limit - shown) * EASE;
    // Below a tenth of a percent the bar has settled into its phase and is
    // waiting, so repainting it would only churn.
    if (next - shown < 0.05) return;
    shown = next;
    paint();
  }

  function step({ percent, ceiling: end, detail: line }: TaskStep) {
    if (settled) return;
    shown = Math.max(shown, percent);
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
    const show = () => {
      const { title: heading, detail: line, retry } = outcome;
      const options = {
        id,
        // A toast is its title and one line under it. A message too long for
        // that line is kept whole in the tooltip rather than growing the toast.
        description: line ? (
          <span className="block truncate" title={line}>
            {line}
          </span>
        ) : undefined,
        duration: kind === "fail" ? Number.POSITIVE_INFINITY : SETTLED_DURATION,
        ...(retry ? { action: { label: "Retry", onClick: retry } } : {}),
      };
      if (kind === "done") toast.success(heading, options);
      else if (kind === "note") toast.info(heading, options);
      else toast.error(heading, options);
    };
    const held = Date.now() - openedAt;
    if (held >= MIN_VISIBLE_MS) show();
    else window.setTimeout(show, MIN_VISIBLE_MS - held);
  }

  paint();
  timer = window.setInterval(glide, TICK_MS);

  return {
    step,
    done: (outcome) => settle("done", outcome),
    note: (outcome) => settle("note", outcome),
    fail: (outcome) => settle("fail", outcome),
  };
}
