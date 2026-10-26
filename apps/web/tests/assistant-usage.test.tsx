import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { summariseAssistantUsage } from "@/lib/assistant/usage";
import { AssistantUsage } from "@/ui/assistant/assistant-usage";

const now = Date.parse("2026-10-26T03:00:00.000Z");
const row = (hoursAgo: number, chat = "a") => ({
  chat_id: chat,
  created_at: new Date(now - hoursAgo * 3_600_000).toISOString(),
  cost_usd: 0.004,
  input_tokens: 9_000,
  cached_input_tokens: 4_000,
  output_tokens: 400,
  latency_ms: 2_400,
});

test("summarises the last 30 days and the rolling daily allowance", () => {
  const summary = summariseAssistantUsage(
    [row(1), row(2, "b"), row(30), row(24 * 31)],
    now,
    { dailyMessageLimit: 2, monthlyCostLimitUsd: 1 },
  );
  expect(summary).toMatchObject({
    messages: 3,
    chats: 2,
    inputTokens: 27_000,
    outputTokens: 1_200,
    averageLatencyMs: 2_400,
  });
  expect(summary.costUsd).toBeCloseTo(0.012);
  expect(summary.allowance).toMatchObject({ messagesToday: 2, allowed: false });
  expect(summary.daily).toHaveLength(7);
  expect(summary.daily.at(-1)?.messages).toBe(2);
});

test("shows the student's own usage and remaining messages", () => {
  render(
    <AssistantUsage
      summary={summariseAssistantUsage([row(1)], now, {
        dailyMessageLimit: 40,
        monthlyCostLimitUsd: 1,
      })}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Compass usage" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Across 1 chat")).toBeVisible();
  expect(screen.getByText("$0.004")).toBeVisible();
  expect(screen.getByText("39 messages left today.")).toBeVisible();
  expect(screen.queryByText(/do not reflect your account/)).toBeNull();
});
