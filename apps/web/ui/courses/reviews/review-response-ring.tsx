const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Response rate as a ring, with the percentage in the centre. */
export function ReviewResponseRing({ percent }: { percent: number }) {
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * CIRCUMFERENCE;
  return (
    <svg
      viewBox="0 0 56 56"
      className="size-12 shrink-0 -rotate-90"
      role="img"
      aria-label={`${percent}% response rate`}
    >
      <circle
        cx="28"
        cy="28"
        r={RADIUS}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth="5"
      />
      <circle
        cx="28"
        cy="28"
        r={RADIUS}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
      />
      <text
        x="28"
        y="28"
        transform="rotate(90 28 28)"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[14px] font-semibold tabular-nums"
      >
        {percent}%
      </text>
    </svg>
  );
}
