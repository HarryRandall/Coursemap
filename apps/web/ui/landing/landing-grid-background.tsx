"use client";
import { useEffect, useId, useRef, useState } from "react";

/** One grid square, in pixels. The 72rem content column is a whole number of them. */
const CELL = 48;
/** The `max-w-6xl` column the section borders sit on. */
const COLUMN = 1152;
const SQUARES = 14;
const FLICKER_MS = 3200;

/** A flickering square, placed as a share of the grid's width and height. */
type Square = { id: number; x: number; y: number; delay: number };

function randomSquare(id: number, delay = 0): Square {
  return { id, x: Math.random(), y: Math.random(), delay };
}

/**
 * The marketing grid: lines drawn from the border token and aligned so one
 * falls on each edge of the content column, a few squares that fade in and
 * out, and a brighter patch that follows the pointer. Fills its positioned
 * parent and listens to pointer movement there; decorative only.
 */
export function LandingGridBackground({
  edge = "column",
}: {
  /**
   * "column" lines the grid up with the content column's borders; "box"
   * keeps lines off the parent's own edges, for a panel beside a divider.
   */
  edge?: "column" | "box";
} = {}) {
  const id = useId().replace(/:/gu, "");
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [squares, setSquares] = useState<Square[]>(() =>
    Array.from({ length: SQUARES }, (_, index) =>
      randomSquare(index, Math.random() * FLICKER_MS),
    ),
  );
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [still, setStill] = useState(false);

  // In a column, lines start at its left edge so the section borders and the
  // grid share one line. In a box, the first line sits a pixel outside the
  // edge, so it never doubles the divider beside the box.
  const offset =
    edge === "box"
      ? -1
      : ((size.width - Math.min(size.width, COLUMN)) / 2) % CELL;
  // The top line would sit under the border above, so it starts off-screen.
  const offsetY = -1;
  const columns = Math.ceil(size.width / CELL) + 1;
  const rows = Math.ceil(size.height / CELL) + 1;

  useEffect(() => {
    const element = ref.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setStill(reduced.matches);
    updateMotion();
    reduced.addEventListener("change", updateMotion);
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    const leave = () => setPointer(null);
    parent.addEventListener("pointermove", move);
    parent.addEventListener("pointerleave", leave);
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", updateMotion);
      parent.removeEventListener("pointermove", move);
      parent.removeEventListener("pointerleave", leave);
    };
  }, []);

  const hovered = pointer
    ? {
        x: Math.floor((pointer.x - offset) / CELL) * CELL + offset,
        y: Math.floor((pointer.y - offsetY) / CELL) * CELL + offsetY,
      }
    : null;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
    >
      <svg className="absolute inset-0 size-full">
        <defs>
          <pattern
            id={`${id}-grid`}
            width={CELL}
            height={CELL}
            x={offset}
            y={offsetY}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
              fill="none"
              strokeWidth="1"
              className="stroke-border"
            />
          </pattern>
          <pattern
            id={`${id}-glow`}
            width={CELL}
            height={CELL}
            x={offset}
            y={offsetY}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
              fill="none"
              strokeWidth="1"
              className="stroke-primary/60"
            />
          </pattern>
          <radialGradient id={`${id}-spot`}>
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id={`${id}-mask`}>
            {pointer ? (
              <circle
                cx={pointer.x}
                cy={pointer.y}
                r={180}
                fill={`url(#${id}-spot)`}
              />
            ) : null}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-grid)`} />
        {size.width > 0 && !still
          ? squares.map((square) => (
              <rect
                key={square.id}
                x={Math.floor(square.x * columns) * CELL + offset + 1}
                y={Math.floor(square.y * rows) * CELL + offsetY + 1}
                width={CELL - 1}
                height={CELL - 1}
                className="landing-grid-flicker fill-primary"
                style={{
                  animationDelay: `${square.delay}ms`,
                  animationDuration: `${FLICKER_MS}ms`,
                }}
                onAnimationIteration={() =>
                  setSquares((current) =>
                    current.map((item) =>
                      item.id === square.id ? randomSquare(item.id) : item,
                    ),
                  )
                }
              />
            ))
          : null}
        {hovered ? (
          <rect
            x={hovered.x + 1}
            y={hovered.y + 1}
            width={CELL - 1}
            height={CELL - 1}
            className="fill-primary/10 transition-[x,y] duration-150"
          />
        ) : null}
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-glow)`}
          mask={`url(#${id}-mask)`}
        />
      </svg>
    </div>
  );
}
