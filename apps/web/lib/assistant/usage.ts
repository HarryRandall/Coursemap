import type { SupabaseClient } from "@supabase/supabase-js";
import { ACADEMIC_TIME_ZONE, canberraTodayIso } from "@/lib/canberra-format";
import type { Database } from "@/types/database";
import { summariseAllowance } from "./allowance";
import type { AssistantAllowance } from "./allowance";

const DAY_MS = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  timeZone: ACADEMIC_TIME_ZONE,
});

export type AssistantUsageRow = {
  chat_id: string;
  created_at: string;
  cost_usd: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  latency_ms: number;
};

export type AssistantUsageSummary = {
  messages: number;
  chats: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  averageLatencyMs: number | null;
  /** The last seven Canberra days, oldest first. */
  daily: Array<{ day: string; label: string; messages: number }>;
  allowance: AssistantAllowance;
};

/** Summarises the last 30 days of a student's Compass replies. */
export function summariseAssistantUsage(
  rows: readonly AssistantUsageRow[],
  now: number,
  limits?: Parameters<typeof summariseAllowance>[2],
): AssistantUsageSummary {
  const recent = rows.filter(
    (row) => now - Date.parse(row.created_at) < 30 * DAY_MS,
  );
  const sum = (key: keyof AssistantUsageRow) =>
    recent.reduce((total, row) => total + Number(row[key]), 0);
  const perDay = new Map<string, number>();
  for (const row of recent) {
    const day = canberraTodayIso(new Date(row.created_at));
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  return {
    messages: recent.length,
    chats: new Set(recent.map((row) => row.chat_id)).size,
    inputTokens: sum("input_tokens"),
    cachedInputTokens: sum("cached_input_tokens"),
    outputTokens: sum("output_tokens"),
    costUsd: sum("cost_usd"),
    averageLatencyMs: recent.length
      ? Math.round(sum("latency_ms") / recent.length)
      : null,
    daily: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now - (6 - index) * DAY_MS);
      const day = canberraTodayIso(date);
      return {
        day,
        label: WEEKDAY.format(date),
        messages: perDay.get(day) ?? 0,
      };
    }),
    allowance: summariseAllowance(recent, now, limits),
  };
}

export async function loadAssistantUsageSummary(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  now = Date.now(),
) {
  const { data, error } = await supabase
    .from("assistant_usage")
    .select(
      "chat_id,created_at,cost_usd,input_tokens,cached_input_tokens,output_tokens,latency_ms",
    )
    .eq("owner_id", ownerId)
    .gte("created_at", new Date(now - 30 * DAY_MS).toISOString());
  if (error) throw new Error("Compass usage could not be loaded.");
  return summariseAssistantUsage(data ?? [], now);
}
