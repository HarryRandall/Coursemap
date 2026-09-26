import { cn } from "@/lib/cn";

/**
 * Highlighted days in the month sketch, coloured with the category tones the
 * key dates list uses: a semester start, a census date, an exam block and a
 * public holiday.
 */
const HIGHLIGHTS: Record<number, string> = {
  3: "fill-primary",
  11: "fill-amber-400 dark:fill-amber-500",
  22: "fill-rose-400 dark:fill-rose-500",
  23: "fill-rose-400 dark:fill-rose-500",
  24: "fill-rose-400 dark:fill-rose-500",
  17: "fill-sky-400 dark:fill-sky-500",
};

const COLUMNS = 7;
const ROWS = 4;
const CELL = 16;
const GAP = 6;
const GRID_X = 38;
const GRID_Y = 50;

/**
 * A decorative month with a few dates marked, drawn in SVG so it follows the
 * theme. It carries no meaning of its own; the text beside it does.
 */
export function CalendarIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-auto w-56", className)}
      fill="none"
      viewBox="0 0 224 168"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse
        cx="112"
        cy="156"
        rx="84"
        ry="7"
        className="fill-muted-foreground/10"
      />
      <rect
        x="22"
        y="14"
        width="180"
        height="136"
        rx="14"
        className="fill-card stroke-border"
        strokeWidth="1.5"
      />
      <path
        d="M22 28a14 14 0 0 1 14-14h152a14 14 0 0 1 14 14v10H22V28Z"
        className="fill-primary/10"
      />
      <rect
        x="38"
        y="23"
        width="46"
        height="6"
        rx="3"
        className="fill-primary/60"
      />
      <rect
        x="150"
        y="23"
        width="36"
        height="6"
        rx="3"
        className="fill-muted-foreground/20"
      />
      <rect
        x="62"
        y="6"
        width="6"
        height="16"
        rx="3"
        className="fill-muted-foreground/40"
      />
      <rect
        x="156"
        y="6"
        width="6"
        height="16"
        rx="3"
        className="fill-muted-foreground/40"
      />
      {Array.from({ length: COLUMNS * ROWS }, (_, index) => {
        const column = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        const highlight = HIGHLIGHTS[index];
        return (
          <rect
            key={index}
            x={GRID_X + column * (CELL + GAP)}
            y={GRID_Y + row * (CELL + GAP)}
            width={CELL}
            height={CELL}
            rx="4"
            className={highlight ?? "fill-muted-foreground/10"}
          />
        );
      })}
      <g className="motion-safe:animate-pulse">
        <circle
          cx={GRID_X + 3 * (CELL + GAP) + CELL / 2}
          cy={GRID_Y + CELL / 2}
          r="13"
          className="stroke-primary/40"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}
