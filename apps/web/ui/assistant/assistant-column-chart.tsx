"use client";

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GradeCode } from "@/lib/academic/metrics";
import type { AssistantVisual } from "@/lib/assistant/attachments";
import { brand, gradeColours } from "@/ui/dashboard/grade-colours";

type ColumnsVisual = Extract<AssistantVisual, { kind: "columns" }>;

const CURRENCY = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

function formatter(visual: ColumnsVisual) {
  return (value: number) =>
    visual.format === "currency"
      ? CURRENCY.format(value)
      : `${Number.isInteger(value) ? value : value.toFixed(1)}${visual.unit ? ` ${visual.unit}` : ""}`;
}

function ColumnTip({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: readonly {
    payload?: ColumnsVisual["items"][number];
  }[];
  format: (value: number) => string;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="coursemap-tooltip w-max max-w-56 px-2.5 py-1.5 text-xs">
      <p className="font-medium">{item.detail ?? item.label}</p>
      <p className="opacity-70">
        {item.planned
          ? `${format(item.value)} done · ${format(item.planned)} planned`
          : format(item.value)}
      </p>
    </div>
  );
}

/**
 * Columns for a figure per study period or category, such as tuition by
 * year, grades by band or units per semester. Planned amounts stack above
 * completed ones in a lighter shade, like the dashboard's progress bars.
 */
export function AssistantColumnChart({ visual }: { visual: ColumnsVisual }) {
  const format = formatter(visual);
  const total = visual.items.reduce(
    (sum, item) => sum + item.value + (item.planned ?? 0),
    0,
  );
  const stacked = visual.items.some((item) => item.planned);
  const colour = (item: ColumnsVisual["items"][number]) =>
    visual.palette === "grades"
      ? (gradeColours[item.label as GradeCode] ?? brand)
      : brand;
  return (
    <>
      {visual.format === "currency" ? (
        <div>
          <p className="text-xl leading-none font-semibold tracking-tight tabular-nums">
            {CURRENCY.format(total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Total across your plan
          </p>
        </div>
      ) : null}
      {stacked ? (
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
      <div
        className="h-28"
        role="img"
        aria-label={`${visual.title}: ${visual.items
          .map(
            (item) =>
              `${item.detail ?? item.label} ${format(item.value + (item.planned ?? 0))}`,
          )
          .join(", ")}`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 320, height: 112 }}
        >
          <BarChart
            data={visual.items}
            margin={{ top: 12, right: 4, bottom: 0, left: 4 }}
            barCategoryGap="22%"
            accessibilityLayer
          >
            <YAxis hide domain={[0, "auto"]} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            />
            <Tooltip
              content={<ColumnTip format={format} />}
              wrapperStyle={{ zIndex: 200 }}
              cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
            />
            {visual.reference ? (
              <ReferenceLine
                y={visual.reference.value}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 3"
                label={{
                  value: visual.reference.label,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "var(--color-muted-foreground)",
                }}
              />
            ) : null}
            <Bar
              dataKey="value"
              stackId="units"
              radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
              isAnimationActive={false}
            >
              {visual.items.map((item) => (
                <Cell key={item.label} fill={colour(item)} />
              ))}
            </Bar>
            {stacked ? (
              <Bar
                dataKey="planned"
                stackId="units"
                fill={brand}
                fillOpacity={0.45}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {visual.note ? (
        <p className="text-[11px] text-muted-foreground">{visual.note}</p>
      ) : null}
    </>
  );
}
