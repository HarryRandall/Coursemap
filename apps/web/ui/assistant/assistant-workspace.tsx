"use client";

import { useEffect, type ReactNode } from "react";
import { Download, Minimize2, X } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
} from "@coursemap/ui/primitives/sidebar";
import { Button } from "@coursemap/ui/primitives/button";
import { Topbar } from "@/ui/shell/topbar";
import { useSidebarDefaultOpen } from "@/ui/shell/sidebar-preference";
import { assistantTitle } from "@/lib/assistant/history";
import { useRouter } from "next/navigation";
import { AssistantChatPicker } from "./assistant-chat-picker";
import { useAssistant } from "./assistant-provider";
import { AssistantSidebar } from "./assistant-sidebar";
import { AssistantPanelContent } from "./assistant-panel-content";

export function AssistantWorkspace({
  children,
  loading = false,
}: {
  children?: ReactNode;
  loading?: boolean;
}) {
  const router = useRouter();
  const { active, returnPath, setPanelOpen } = useAssistant();
  const { open, setOpen } = useSidebarDefaultOpen();
  const title = assistantTitle(active);
  useEffect(() => {
    setPanelOpen(false);
  }, [setPanelOpen]);
  function exportChat() {
    if (!active?.messages.length) return;
    const transcript = `# ${title}\n\n${active.messages.map((message) => `## ${message.role === "user" ? "You" : "Compass"}\n\n${message.text}`).join("\n\n")}\n`;
    const url = URL.createObjectURL(
      new Blob([transcript], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `compass-${active.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      className="h-dvh min-h-0 overflow-hidden"
    >
      <AssistantSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden md:ring-1 md:ring-border">
        <Topbar
          loading={loading}
          title={
            children && !loading ? (
              <span className="text-sm font-medium">Usage</span>
            ) : (
              <AssistantChatPicker />
            )
          }
          currentBreadcrumbLabel={title}
          breadcrumbSegmentLabels={{ compass: null }}
          actions={
            <>
              {!children && active?.messages.length ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Export chat"
                  onClick={exportChat}
                >
                  <Download aria-hidden="true" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dock assistant"
                onClick={() => {
                  setPanelOpen(true);
                  router.push(returnPath);
                }}
              >
                <Minimize2 aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close assistant"
                onClick={() => {
                  setPanelOpen(false);
                  router.push(returnPath);
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </>
          }
        />
        <main className="min-h-0 flex-1">
          {children ?? (
            <>
              <h1 className="sr-only">{title}</h1>
              <AssistantPanelContent
                expanded
                hideHeader
                onExpand={() => {}}
                onClose={() => {}}
              />
            </>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
