"use client";

import { useState } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@coursemap/ui/primitives/dropdown-menu";

const sampleNotifications = [
  {
    id: "plan",
    title: "Your degree plan",
    message: "is ready to review.",
    time: "2 min ago",
    icon: BookOpen,
    unread: true,
  },
  {
    id: "calendar",
    title: "University calendar",
    message: "has new key dates to explore.",
    time: "1 hour ago",
    icon: CalendarDays,
    unread: true,
  },
  {
    id: "welcome",
    title: "Welcome to Coursemap",
    message: "Start exploring courses and planning your degree.",
    time: "3 hours ago",
    icon: Sparkles,
    unread: false,
  },
];

export function NotificationsMenu() {
  const [notifications, setNotifications] = useState(sampleNotifications);
  const unreadCount = notifications.filter(({ unread }) => unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative size-10 shrink-0 data-[state=open]:bg-accent data-[state=open]:text-foreground dark:data-[state=open]:bg-accent"
          aria-label={
            unreadCount
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell aria-hidden="true" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              size="sm"
              className="absolute top-1 right-1 rounded-full px-1"
              aria-hidden="true"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80 max-w-[calc(100vw-24px)]"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Notifications"
      >
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          <span className="text-xs font-normal text-muted-foreground">
            Sample
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex items-start gap-2 py-2"
              onSelect={(event) => {
                event.preventDefault();
                setNotifications((current) =>
                  current.map((item) =>
                    item.id === notification.id
                      ? { ...item, unread: false }
                      : item,
                  ),
                );
              }}
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                <notification.icon className="size-3.5" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-px">
                <p className="leading-snug">
                  <span className="font-medium">{notification.title}</span>{" "}
                  <span className="text-muted-foreground">
                    {notification.message}
                  </span>
                </p>
                <span className="text-xs text-muted-foreground">
                  {notification.time}
                </span>
              </div>
              {notification.unread && (
                <>
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Unread</span>
                </>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="justify-center"
          disabled={unreadCount === 0}
          onSelect={(event) => {
            event.preventDefault();
            setNotifications((current) =>
              current.map((item) => ({ ...item, unread: false })),
            );
          }}
        >
          <CheckCheck aria-hidden="true" />
          {unreadCount ? "Mark all as read" : "All caught up"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
