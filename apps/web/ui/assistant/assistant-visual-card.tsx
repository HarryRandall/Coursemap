"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import type { AssistantVisual } from "@/lib/assistant/attachments";
import { AssistantColumnChart } from "./assistant-column-chart";
import { AssistantTrendChart } from "./assistant-trend-chart";
import { darkStatusTint } from "@/ui/dashboard/status-badge-tint";
import { RequirementBar } from "@/ui/dashboard/requirement-bar";

type MeterVisual = Extract<AssistantVisual, { kind: "meter" }>;
type BarsVisual = Extract<AssistantVisual, { kind: "bars" }>;

function amount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function percent(value: number, scale: number) {
  return `${Math.min(100, Math.max(0, (value / scale) * 100)).toFixed(2)}%`;
}

/**
 * One value on its scale with the value a rule requires, as a bullet chart.
 * The fill stays brand violet; meeting or missing the requirement is said by
 * a labelled status badge, so it never rests on colour alone.
 */
function MeterChart({ visual }: { visual: MeterVisual }) {
  const { value, max, target } = visual;
  const meets = target === undefined || value >= target;
  const unit = visual.unit && visual.unit !== "GPA" ? ` ${visual.unit}` : "";
  const ticks =
    max <= 10 && Number.isInteger(max)
      ? Array.from({ length: max + 1 }, (_, tick) => tick)
      : [0, max / 2, max];
  const summary =
    target === undefined
      ? `${amount(value)} of ${amount(max)}${unit}`
      : `${amount(value)} against ${amount(target)} required, ${
          meets ? "meets the requirement" : `${amount(target - value)} below`
        }`;
  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <p className="text-xl leading-none font-semibold tracking-tight tabular-nums">
          {amount(value)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            / {amount(max)}
            {unit}
          </span>
        </p>
        {target !== undefined ? (
          <Badge
            variant={meets ? "success" : "warning"}
            className={darkStatusTint[meets ? "success" : "warning"]}
          >
            {meets ? (
              <CircleCheck aria-hidden="true" />
            ) : (
              <CircleAlert aria-hidden="true" />
            )}
            {meets
              ? `Meets ${amount(target)}`
              : `${amount(target - value)} below ${amount(target)}`}
          </Badge>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            tabIndex={0}
            aria-label={summary}
            className="group/meter relative mt-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="h-3 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-[filter] group-hover/meter:brightness-110"
                style={{ width: percent(value, max) }}
              />
            </div>
            {target !== undefined ? (
              <div
                aria-hidden="true"
                className="absolute -top-5 bottom-[-4px] flex -translate-x-1/2 flex-col items-center"
                style={{ left: percent(target, max) }}
              >
                <span className="text-[10px] leading-none font-medium whitespace-nowrap text-muted-foreground">
                  Needs {amount(target)}
                </span>
                <span className="mt-1 w-0.5 flex-1 rounded-full bg-foreground" />
              </div>
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent>{summary}</TooltipContent>
      </Tooltip>
      <div
        aria-hidden="true"
        className="relative mt-2 h-3 text-[10px] text-muted-foreground tabular-nums"
      >
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
            style={{ left: percent(tick, max) }}
          >
            {amount(tick)}
          </span>
        ))}
      </div>
    </>
  );
}

// ANU's 7-point scale: the grade each whole point stands for.
const GPA_BANDS = [
  { from: 0, to: 4, label: "Below pass" },
  { from: 4, to: 5, label: "Pass" },
  { from: 5, to: 6, label: "Credit" },
  { from: 6, to: 7, label: "Distinction" },
] as const;

function gpaBandLabel(gpa: number) {
  if (gpa >= 7) return "High distinction average";
  const band = GPA_BANDS.findLast((item) => gpa >= item.from);
  return band ? `${band.label} average` : "";
}

/**
 * A GPA on ANU's grade bands, zoomed to the bands that matter, with the
 * student's GPA and any required GPA marked on the same scale.
 */
function GpaMeter({ visual }: { visual: MeterVisual }) {
  const { value, target } = visual;
  const meets = target === undefined || value >= target;
  // Show from the pass band down to whatever band the values reach.
  const low = Math.min(4, Math.floor(Math.min(value, target ?? value)));
  const span = 7 - low;
  const at = (point: number) => percent(point - low, span);
  const bands = GPA_BANDS.filter((band) => band.to > low).map((band) => ({
    ...band,
    from: Math.max(band.from, low),
  }));
  const summary = `GPA ${value.toFixed(2)} of 7, ${gpaBandLabel(value).toLowerCase()}${
    target === undefined
      ? ""
      : meets
        ? `, meets the ${amount(target)} required`
        : `, ${(target - value).toFixed(2)} below the ${amount(target)} required`
  }`;
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl leading-none font-semibold tracking-tight tabular-nums">
            {value.toFixed(2)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              / 7
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {gpaBandLabel(value)}
          </p>
        </div>
        {target !== undefined ? (
          <Badge
            variant={meets ? "success" : "warning"}
            className={darkStatusTint[meets ? "success" : "warning"]}
          >
            {meets ? (
              <CircleCheck aria-hidden="true" />
            ) : (
              <CircleAlert aria-hidden="true" />
            )}
            {meets
              ? `Meets ${amount(target)}`
              : `${(target - value).toFixed(2)} below ${amount(target)}`}
          </Badge>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            tabIndex={0}
            aria-label={summary}
            className="relative mt-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {bands.map((band, index) => (
                <span
                  key={band.label}
                  className="h-full"
                  style={{
                    width: percent(band.to - band.from, span),
                    // Bands deepen towards a high distinction.
                    background: `color-mix(in oklab, var(--primary) ${18 + index * 14}%, var(--border))`,
                  }}
                />
              ))}
            </div>
            {target !== undefined ? (
              <span
                aria-hidden="true"
                className="absolute -top-5 bottom-[-6px] flex -translate-x-1/2 flex-col items-center"
                style={{ left: at(target) }}
              >
                <span className="text-[10px] leading-none font-medium whitespace-nowrap text-muted-foreground">
                  Needs {amount(target)}
                </span>
                <span className="mt-1 w-px flex-1 border-l border-dashed border-foreground/70" />
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-sm"
              style={{ left: at(value) }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{summary}</TooltipContent>
      </Tooltip>
      <div
        aria-hidden="true"
        className="relative mt-2.5 h-3 text-[10px] text-muted-foreground"
      >
        {bands.map((band) => (
          <span
            key={band.label}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: at((band.from + band.to) / 2) }}
          >
            {band.label}
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Progress for several items, each a row with completed then planned units
 * against its own target, matching the dashboard's requirement bars.
 */
function BarsChart({ visual }: { visual: BarsVisual }) {
  const unit = visual.unit ? ` ${visual.unit}` : "";
  const hasPlanned = visual.items.some((item) => item.planned);
  const untargetedScale = Math.max(
    1,
    ...visual.items.map((item) => item.value + (item.planned ?? 0)),
  );
  return (
    <>
      {hasPlanned ? (
        <div
          aria-hidden="true"
          className="flex items-center gap-3 text-[11px] text-muted-foreground"
        >
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-primary" />
            Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-primary/45" />
            Planned
          </span>
        </div>
      ) : null}
      <ul className="-mx-2 space-y-0.5">
        {visual.items.map((item, index) => {
          const placed = item.value + (item.planned ?? 0);
          const remaining =
            item.target !== undefined ? Math.max(0, item.target - placed) : 0;
          const summary = [
            `${item.label}:`,
            hasPlanned
              ? `${amount(item.value)} completed, ${amount(item.planned ?? 0)} planned`
              : `${amount(item.value)}${unit}`,
            item.target !== undefined
              ? remaining
                ? `${amount(remaining)}${unit} to go of ${amount(item.target)}`
                : `target of ${amount(item.target)} reached`
              : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={index}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    aria-label={summary}
                    className="space-y-1.5 rounded-md px-2 py-1.5 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate">{item.label}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        <span className="font-medium text-foreground">
                          {amount(placed)}
                        </span>
                        {item.target !== undefined
                          ? ` / ${amount(item.target)}`
                          : ""}
                        {unit}
                      </span>
                    </div>
                    <RequirementBar
                      completedUnits={item.value}
                      plannedUnits={item.planned ?? 0}
                      targetUnits={item.target ?? untargetedScale}
                      height={6}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">{summary}</TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A chart Compass drew from tool data, with a tooltip on every mark. */
export function AssistantVisualCard({ visual }: { visual: AssistantVisual }) {
  return (
    <TooltipProvider delayDuration={80}>
      <figure
        aria-label={visual.title}
        className="space-y-2.5 rounded-xl border border-border p-3.5"
      >
        <figcaption className="text-xs font-medium text-muted-foreground">
          {visual.title}
        </figcaption>
        {visual.kind === "meter" &&
        visual.unit === "GPA" &&
        visual.max === 7 ? (
          <GpaMeter visual={visual} />
        ) : visual.kind === "meter" ? (
          <MeterChart visual={visual} />
        ) : visual.kind === "line" ? (
          <AssistantTrendChart visual={visual} />
        ) : visual.kind === "columns" ? (
          <AssistantColumnChart visual={visual} />
        ) : (
          <BarsChart visual={visual} />
        )}
      </figure>
    </TooltipProvider>
  );
}
