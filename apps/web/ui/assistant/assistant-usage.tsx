import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@coursemap/ui/primitives/card";
import { Progress } from "@coursemap/ui/primitives/progress";

const metrics = [
  { label: "Messages", value: "128", detail: "Across 24 conversations" },
  { label: "Tokens", value: "42.8k", detail: "31.2k input · 11.6k output" },
  {
    label: "Average response",
    value: "1.8s",
    detail: "Time to first response",
  },
  {
    label: "Estimated cost",
    value: "$0.24",
    detail: "Estimated cost in USD",
  },
];
const activity = [18, 12, 24, 16, 31, 15, 12];

export function AssistantUsage() {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Compass usage preview</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Sample activity, costs and allowance for the interface preview.
            These figures do not reflect your account.
          </p>
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
              <CardDescription>
                Messages sent over the last week
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="flex h-52 items-end gap-3"
                role="img"
                aria-label="Daily messages: Monday 18, Tuesday 12, Wednesday 24, Thursday 16, Friday 31, Saturday 15, Sunday 12"
              >
                {activity.map((count, index) => (
                  <div
                    key={index}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {count}
                    </span>
                    <div
                      className="rounded-t-md bg-primary/75"
                      style={{ height: `${(count / 31) * 75}%` }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Message allowance</CardTitle>
              <CardDescription>Monthly allowance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  128{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / 500 messages
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">26%</span>
              </div>
              <Progress value={25.6} aria-label="Message allowance used" />
              <p className="text-sm text-muted-foreground">
                372 messages remaining.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
