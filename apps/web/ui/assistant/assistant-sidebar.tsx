"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, SquarePen, ChartNoAxesColumn } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@coursemap/ui/primitives/sidebar";
import { BrandMark } from "@/ui/brand-mark";
import { CourseFind } from "@/ui/course-find";
import { AccountMenu } from "@/ui/shell/account-menu";
import { sectionLabel } from "@/ui/shell/breadcrumbs";
import { usePathname } from "next/navigation";
import { AssistantRecentChat } from "./assistant-recent-chat";
import { assistantAge } from "@/lib/assistant/history";
import { useAssistant } from "./assistant-provider";

export function AssistantSidebar() {
  const {
    chats,
    active,
    select,
    remove,
    rename,
    newChat,
    returnPath,
    setPanelOpen,
  } = useAssistant();
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    const initial = setTimeout(() => setNow(Date.now()), 0);
    return () => {
      clearInterval(timer);
      clearTimeout(initial);
    };
  }, []);
  const close = () => setOpenMobile(false);
  const history = chats.filter((chat) => chat.messages.length > 0);
  return (
    <Sidebar variant="inset" collapsible="icon" className="select-none">
      <SidebarHeader className="gap-3 px-3 pb-3 group-data-[collapsible=icon]:px-2">
        <Link
          href="/dashboard"
          aria-label="Coursemap home"
          onClick={close}
          className="flex h-12 items-center gap-2.5 overflow-hidden rounded-md px-1.5 group-data-[collapsible=icon]:px-0"
        >
          <BrandMark className="size-8 shrink-0" />
          <strong className="brand-wordmark shrink-0 text-[17px] group-data-[collapsible=icon]:opacity-0">
            coursemap
          </strong>
        </Link>
        <CourseFind onNavigate={close} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3 py-2 group-data-[collapsible=icon]:px-2">
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="New chat"
                className="h-10 gap-3 px-3"
                onClick={() => {
                  newChat();
                  close();
                }}
              >
                <SquarePen aria-hidden="true" />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/compass/usage"}
                tooltip="Usage"
                className="h-10 gap-3 px-3"
              >
                <Link href="/compass/usage" onClick={close}>
                  <ChartNoAxesColumn aria-hidden="true" />
                  <span>Usage</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="px-3 py-2 group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recent chats</SidebarGroupLabel>
          <SidebarMenu>
            {history.map((chat) => (
              <AssistantRecentChat
                key={chat.id}
                chat={chat}
                age={now ? assistantAge(chat.updatedAt, now) : ""}
                active={pathname !== "/compass/usage" && active?.id === chat.id}
                onSelect={() => {
                  select(chat.id);
                  close();
                }}
                onDelete={() => remove(chat.id)}
                onRename={(title) => rename(chat.id, title)}
              />
            ))}
          </SidebarMenu>
          {!history.length && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No chats yet
            </p>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {/* Leaving Compass sits with the account row, as the admin shell's
            way back does, and names the page it returns to. */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={`Back to ${sectionLabel(returnPath)}`}
              className="h-10 gap-3 px-3"
            >
              <Link
                href={returnPath}
                onClick={() => {
                  setPanelOpen(false);
                  close();
                }}
              >
                <ArrowLeft aria-hidden="true" />
                <span>Back to {sectionLabel(returnPath)}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <AccountMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
