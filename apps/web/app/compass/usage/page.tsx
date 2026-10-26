import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/viewer";
import { loadAssistantUsageSummary } from "@/lib/assistant/usage";
import { createClient } from "@/lib/supabase/server";
import { AssistantWorkspace } from "@/ui/assistant/assistant-workspace";
import { AssistantUsage } from "@/ui/assistant/assistant-usage";

export default async function CompassUsagePage() {
  const { viewer } = await getAuthContext();
  if (!viewer) redirect("/login?next=%2Fcompass%2Fusage");
  const summary = await loadAssistantUsageSummary(
    await createClient(),
    viewer.id,
  );
  return (
    <AssistantWorkspace>
      <AssistantUsage summary={summary} />
    </AssistantWorkspace>
  );
}
