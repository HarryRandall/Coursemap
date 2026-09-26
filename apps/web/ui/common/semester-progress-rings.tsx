"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEntered } from "@/hooks/use-entered";
import { cn } from "@/lib/cn";
import { STANDARD_TERM_UNITS } from "@/lib/planner";

type Series = {
  label: string;
  units: number;
  className: string;
  /** Colour while the segment is hovered, when it differs. */
  activeClassName?: string;
};

type Hover = {
  ring: number;
  index: number;
  /** Tooltip anchor in viewport pixels, just outside the rings. */
  x: number;
  y: number;
  /** Shifts the tooltip away from the anchor so it clears the rings. */
  transform: string;
  title: string;
  detail: string;
};

/** Gap between semester segments, as a share of the ring's length. */
const GAP = 1.2;
/** Rendered size of the rings in pixels, matching `size-28`. */
const SIZE = 112;
/** How far outside the rings the tooltip sits, in pixels. */
const CLEARANCE = 12;

/**
 * One ring cut into semester-sized segments. Series fill it in order from
 * the top, so a half-finished semester shows as a half-filled segment. The
 * hovered segment grows outward and the others dim.
 */
function SegmentedRing({
  ring,
  radius,
  hitInset = 0,
  target,
  series,
  hover,
  onHover,
}: {
  ring: number;
  radius: number;
  /** Extra hover area on the ring's inner side, in view-box units. */
  hitInset?: number;
  target: number;
  series: readonly Series[];
  hover: Hover | null;
  onHover: (hover: Hover | null) => void;
}) {
  const semesters = Math.max(1, Math.ceil(target / STANDARD_TERM_UNITS));
  const span = 100 / semesters;
  let filled = 0;
  const ranges = series.map((item) => {
    const from = filled;
    filled += item.units;
    return { ...item, from, to: from + item.units };
  });
  const arc = (from: number, to: number, className: string, key: string) => {
    const start = (from / target) * 100;
    const end = (to / target) * 100;
    return end > start ? (
      <circle
        key={key}
        cx="32"
        cy="32"
        r={radius}
        pathLength="100"
        className={className}
        strokeDasharray={`${end - start} 100`}
        strokeDashoffset={-start}
      />
    ) : null;
  };
  return Array.from({ length: semesters }, (_, index) => {
    // Each segment covers one semester's worth of units, trimmed by the gap.
    const low = index * STANDARD_TERM_UNITS;
    const high = Math.min(target, low + STANDARD_TERM_UNITS);
    const trim = ((GAP / 2) * target) / 100;
    const parts = ranges.map((range) => ({
      ...range,
      units: Math.max(0, Math.min(high, range.to) - Math.max(low, range.from)),
    }));
    const summary = parts
      .filter((part) => part.units > 0)
      .map((part) => `${part.units} ${part.label}`);
    const title = `Semester ${index + 1}`;
    const detail = summary.length ? summary.join(" · ") : "Nothing yet";
    const active = hover?.ring === ring && hover.index === index;
    // The tooltip sits outside the rings in line with the segment's middle:
    // to the right of right-hand segments, above top ones, and so on.
    const angle = ((index + 0.5) / semesters) * 2 * Math.PI;
    const anchor = (svg: SVGSVGElement | null) => {
      const box = svg?.getBoundingClientRect();
      const x = Math.sin(angle);
      const y = -Math.cos(angle);
      const reach = SIZE / 2 + CLEARANCE;
      const shift = (value: number) =>
        value > 0.35 ? "0%" : value < -0.35 ? "-100%" : "-50%";
      return {
        x: (box?.left ?? 0) + SIZE / 2 + reach * x,
        y: (box?.top ?? 0) + SIZE / 2 + reach * y,
        transform: `translate(${shift(x)}, ${shift(y)})`,
      };
    };
    const show = (svg: SVGSVGElement | null) =>
      onHover({ ring, index, ...anchor(svg), title, detail });
    return (
      <g
        key={index}
        tabIndex={0}
        role="img"
        aria-label={`${title}: ${detail}`}
        className="cursor-default transition-[transform,opacity] duration-150 ease-out outline-none motion-reduce:transition-none"
        style={{
          transformBox: "view-box",
          transformOrigin: "32px 32px",
          transform: active ? "scale(1.07)" : undefined,
          opacity: hover && !active ? 0.45 : 1,
        }}
        onPointerEnter={(event) => show(event.currentTarget.ownerSVGElement)}
        onPointerLeave={() => onHover(null)}
        onFocus={(event) => show(event.currentTarget.ownerSVGElement)}
        onBlur={() => onHover(null)}
      >
        {/* A wide transparent stroke makes the thin arc easy to hover. The
            inner ring's reaches further into the middle. */}
        <circle
          cx="32"
          cy="32"
          r={radius - hitInset / 2}
          pathLength="100"
          stroke="transparent"
          strokeWidth={6 + hitInset}
          strokeDasharray={`${span - GAP} 100`}
          strokeDashoffset={-(index * span + GAP / 2)}
        />
        {arc(low + trim, high - trim, "stroke-muted-foreground/20", "track")}
        {parts.map((part) =>
          arc(
            Math.max(low + trim, part.from),
            Math.min(high - trim, part.to),
            cn(
              "enter-draw",
              active
                ? (part.activeClassName ?? part.className)
                : part.className,
            ),
            part.label,
          ),
        )}
      </g>
    );
  });
}

/**
 * Degree progress as two rings cut into semesters: completed units on the
 * outside, enrolled and planned units inside. Hovering a segment shows its
 * units just outside the rings, beside that segment.
 */
export function SemesterProgressRings({
  completed,
  enrolled,
  planned,
  target,
  children,
}: {
  completed: number;
  enrolled: number;
  /** Planned units not yet enrolled in. */
  planned: number;
  target: number;
  children: ReactNode;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const entered = useEntered();
  return (
    <div
      className="relative grid size-28 shrink-0 place-items-center"
      data-entered={entered || undefined}
    >
      {/* Unrotated so pointer positions match the tooltip's coordinates. */}
      <svg
        viewBox="0 0 64 64"
        className="absolute inset-0 size-full overflow-visible"
        fill="none"
        strokeWidth="4"
      >
        <g transform="rotate(-90 32 32)">
          <SegmentedRing
            ring={0}
            radius={29}
            target={target}
            hover={hover}
            onHover={setHover}
            series={[
              {
                label: "completed",
                units: completed,
                className: "stroke-success",
              },
            ]}
          />
          <SegmentedRing
            ring={1}
            radius={23.5}
            hitInset={8}
            target={target}
            hover={hover}
            onHover={setHover}
            series={[
              {
                label: "enrolled",
                units: enrolled,
                className: "stroke-primary",
              },
              {
                label: "planned",
                units: planned,
                className: "stroke-primary/40",
                activeClassName: "stroke-primary",
              },
            ]}
          />
        </g>
      </svg>
      <span className="pointer-events-none text-2xl font-semibold tabular-nums">
        {children}
      </span>
      {/* Portalled so the card's edge cannot clip it. */}
      {hover
        ? createPortal(
            <div
              aria-hidden="true"
              className="coursemap-tooltip pointer-events-none fixed z-50 w-max px-3 py-2 text-xs"
              style={{
                left: hover.x,
                top: hover.y,
                transform: hover.transform,
              }}
            >
              <span className="font-medium">{hover.title}</span>
              <span className="opacity-70"> · {hover.detail}</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
