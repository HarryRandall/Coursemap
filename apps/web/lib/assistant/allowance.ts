import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const DAY_MS = 86_400_000;
export const ASSISTANT_DAILY_MESSAGE_LIMIT = 40;
export const ASSISTANT_MONTHLY_COST_LIMIT_USD = 1;

export type AssistantAllowance = {
  messagesToday: number;
  dailyMessageLimit: number;
  costThisMonthUsd: number;
  monthlyCostLimitUsd: number;
  allowed: boolean;
};

function positiveSetting(value: string | undefined, fallback: number) {
  const number = Number(value);
  return value && Number.isFinite(number) && number > 0 ? number : fallback;
}

export function assistantLimits(env: NodeJS.ProcessEnv = process.env) {
  return {
    dailyMessageLimit: Math.floor(
      positiveSetting(
        env.COURSEMAP_ASSISTANT_DAILY_MESSAGES,
        ASSISTANT_DAILY_MESSAGE_LIMIT,
      ),
    ),
    monthlyCostLimitUsd: positiveSetting(
      env.COURSEMAP_ASSISTANT_MONTHLY_USD,
      ASSISTANT_MONTHLY_COST_LIMIT_USD,
    ),
  };
}

/**
 * Both windows are rolling, so the allowance does not depend on a time zone
 * and a student cannot double their use around midnight or a month boundary.
 */
export function summariseAllowance(
  rows: Array<{ created_at: string; cost_usd: number }>,
  now: number,
  limits = assistantLimits(),
): AssistantAllowance {
  const messagesToday = rows.filter(
    (row) => now - Date.parse(row.created_at) < DAY_MS,
  ).length;
  const costThisMonthUsd = rows
    .filter((row) => now - Date.parse(row.created_at) < 30 * DAY_MS)
    .reduce((total, row) => total + Number(row.cost_usd), 0);
  return {
    messagesToday,
    costThisMonthUsd,
    ...limits,
    allowed:
      messagesToday < limits.dailyMessageLimit &&
      costThisMonthUsd < limits.monthlyCostLimitUsd,
  };
}

export async function loadAssistantAllowance(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  now = Date.now(),
) {
  const { data, error } = await supabase
    .from("assistant_usage")
    .select("created_at,cost_usd")
    .eq("owner_id", ownerId)
    .gte("created_at", new Date(now - 30 * DAY_MS).toISOString());
  if (error) throw new Error("The Compass allowance could not be loaded.");
  return summariseAllowance(data ?? [], now);
}
