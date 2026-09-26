"use client";

/**
 * A one-line Recharts hover card: the point's label and its value, nothing
 * else. It shares the `.coursemap-tooltip` surface with every other tooltip.
 */
export function ChartTip({
  active,
  payload,
  label,
  format = (value) => String(value),
}: {
  active?: boolean;
  payload?: readonly { value?: string | number }[];
  label?: string | number;
  format?: (value: number) => string;
}) {
  const value = payload?.[0]?.value;
  if (!active || value === undefined) return null;
  return (
    <div className="coursemap-tooltip w-max px-2.5 py-1.5 text-xs">
      <span className="font-medium">{label}</span>
      <span className="opacity-70"> · {format(Number(value))}</span>
    </div>
  );
}
