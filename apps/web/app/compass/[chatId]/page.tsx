import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/viewer";
import { AssistantWorkspace } from "@/ui/assistant/assistant-workspace";
import { CompassSignInPrompt } from "@/ui/assistant/compass-sign-in-prompt";

export default async function CompassChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  if (
    chatId !== "new" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      chatId,
    )
  )
    notFound();
  const { viewer } = await getAuthContext();
  // Compass runs a paid model, so guests are asked for an account first.
  if (!viewer) return <CompassSignInPrompt />;
  return <AssistantWorkspace />;
}
