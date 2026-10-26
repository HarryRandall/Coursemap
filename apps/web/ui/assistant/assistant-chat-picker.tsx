"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@coursemap/ui/primitives/dropdown-menu";
import { useState } from "react";
import { assistantTitle, assistantAge } from "@/lib/assistant/history";
import { useAssistant } from "./assistant-provider";

export function AssistantChatPicker() {
  const { active, chats, select } = useAssistant();
  const [now, setNow] = useState(0);
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setNow(Date.now());
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="group max-w-full min-w-0 shrink font-medium data-[state=open]:bg-accent"
          aria-label="Switch chat"
        >
          <span className="truncate">{assistantTitle(active)}</span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <DropdownMenuLabel>Recent chats</DropdownMenuLabel>
        {chats
          .filter((chat) => chat.messages.length)
          .map((chat) => (
            <DropdownMenuItem
              key={chat.id}
              aria-label={assistantTitle(chat)}
              aria-current={chat.id === active?.id ? "true" : undefined}
              className="aria-[current=true]:bg-accent aria-[current=true]:font-medium"
              onSelect={() => select(chat.id)}
            >
              <span className="min-w-0 flex-1 truncate">
                {assistantTitle(chat)}
              </span>
              <time
                dateTime={chat.updatedAt}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {now ? assistantAge(chat.updatedAt, now) : ""}
              </time>
            </DropdownMenuItem>
          ))}
        {!chats.some((chat) => chat.messages.length) && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No chats yet
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
