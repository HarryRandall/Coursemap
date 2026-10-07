import { cn } from "@/lib/cn";

/**
 * Concentric progress rings, outermost first. Each ring is a share from 0 to
 * 1; null draws only the empty track.
 */
export function ShareRing({
  values,
  size = 56,
  thickness = 6,
  label,
  centre,
  className,
}: {
  values: readonly { share: number | null; tone: "primary" | "secondary" }[];
  size?: number;
  thickness?: number;
  label: string;
  centre?: string;
  className?: string;
}) {
  const middle = size / 2;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={cn("shrink-0", className)}
    >
      {values.map((value, index) => {
        const radius = middle - thickness / 2 - index * (thickness + 2);
        const circumference = 2 * Math.PI * radius;
        const share = Math.min(1, Math.max(0, value.share ?? 0));
        return (
          <g key={index} transform={`rotate(-90 ${middle} ${middle})`}>
            <circle
              cx={middle}
              cy={middle}
              r={radius}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth={thickness}
            />
            {share > 0 ? (
              <circle
                cx={middle}
                cy={middle}
                r={radius}
                fill="none"
                stroke="var(--color-primary)"
                strokeOpacity={value.tone === "primary" ? 1 : 0.45}
                strokeWidth={thickness}
                // A rounded end on a sliver of arc reads as a stray dot.
                strokeLinecap={share >= 0.04 ? "round" : "butt"}
                strokeDasharray={`${share * circumference} ${circumference}`}
              />
            ) : null}
          </g>
        );
      })}
      {centre ? (
        <text
          x={middle}
          y={middle}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground font-semibold tabular-nums"
          // Scales with the ring, so a large ring's figure stays in proportion.
          fontSize={Math.max(12, size * 0.16)}
        >
          {centre}
        </text>
      ) : null}
    </svg>
  );
}
