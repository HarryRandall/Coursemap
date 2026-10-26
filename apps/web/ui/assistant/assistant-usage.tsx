import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@coursemap/ui/primitives/card";
import { Progress } from "@coursemap/ui/primitives/progress";
import type { AssistantUsageSummary } from "@/lib/assistant/usage";

const COUNT = new Intl.NumberFormat("en-AU", { notation: "compact" });
const USD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  // Most months cost cents, so a third decimal keeps small totals readable.
  maximumFractionDigits: 3,
  minimumFractionDigits: 2,
});

export function AssistantUsage({
  summary,
}: {
  summary: AssistantUsageSummary;
}) {
  const { allowance, daily } = summary;
  const peak = Math.max(1, ...daily.map((day) => day.messages));
  const metrics = [
    {
      label: "Messages",
      value: COUNT.format(summary.messages),
      detail: `Across ${summary.chats} ${summary.chats === 1 ? "chat" : "chats"}`,
    },
    {
      label: "Tokens",
      value: COUNT.format(summary.inputTokens + summary.outputTokens),
      detail: `${COUNT.format(summary.inputTokens)} input · ${COUNT.format(summary.outputTokens)} output`,
    },
    {
      label: "Average reply",
      value:
        summary.averageLatencyMs === null
          ? "None"
          : `${(summary.averageLatencyMs / 1000).toFixed(1)}s`,
      detail: "Including course and plan lookups",
    },
    {
      label: "Cost",
      value: USD.format(summary.costUsd),
      detail: "Model cost in US dollars",
    },
  ];
  const remaining = Math.max(
    0,
    allowance.dailyMessageLimit - allowance.messagesToday,
  );
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-6">
        <div>
          <h1 className="sr-only">Compass usage</h1>
          <p className="text-sm text-muted-foreground">Your last 30 days.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardHeader>
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {metric.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{metric.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Daily activity</CardTitle>
              <CardDescription>Messages over the last week</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="flex h-52 items-end gap-3"
                role="img"
                aria-label={`Daily messages: ${daily.map((day) => `${day.label} ${day.messages}`).join(", ")}`}
              >
                {daily.map((day) => (
                  <div
                    key={day.day}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {day.messages}
                    </span>
                    <div
                      className="min-h-px rounded-t-md bg-primary/75"
                      style={{ height: `${(day.messages / peak) * 75}%` }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {day.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Daily allowance</CardTitle>
              <CardDescription>Resets over a rolling 24 hours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {allowance.messagesToday}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {allowance.dailyMessageLimit} messages
                  </span>
                </span>
              </div>
              <Progress
                value={Math.min(
                  100,
                  (allowance.messagesToday / allowance.dailyMessageLimit) * 100,
                )}
                aria-label="Daily allowance used"
              />
              <p className="text-sm text-muted-foreground">
                {allowance.allowed
                  ? `${remaining} ${remaining === 1 ? "message" : "messages"} left today.`
                  : allowance.messagesToday >= allowance.dailyMessageLimit
                    ? "No messages left today."
                    : "This month's allowance is used up."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
