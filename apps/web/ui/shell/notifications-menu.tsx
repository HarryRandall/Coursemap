"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCheck,
  Inbox,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";
import { ScrollArea } from "@coursemap/ui/primitives/scroll-area";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import {
  loadNotifications,
  markNotificationsRead,
  type Notification,
} from "@/lib/coursemap/notifications";
import { cn } from "@/lib/cn";

/**
 * A row carrying a kind this build has not heard of still draws, with the bell
 * itself, rather than dropping out of the inbox.
 */
const kindIcons: Record<string, LucideIcon> = {
  key_date: CalendarDays,
  plan_risk: TriangleAlert,
  published_change: BookOpen,
  catalogue_sync: RefreshCw,
};

const relative = new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Coarse and forgiving. The exact minute never matters in an inbox, and the
 * value is recomputed on every render rather than ticking, so an open menu
 * cannot disagree with itself.
 */
function timeAgo(iso: string) {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed)) return "";
  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR)
    return relative.format(-Math.round(elapsed / MINUTE), "minute");
  if (elapsed < DAY)
    return relative.format(-Math.round(elapsed / HOUR), "hour");
  if (elapsed < 7 * DAY)
    return relative.format(-Math.round(elapsed / DAY), "day");
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/**
 * Today and Earlier, not New and Read. Grouping on read state would make a row
 * jump to another heading the moment it was read, which loses the reader's
 * place; grouping on age keeps every row where it was put.
 */
function groupOf(iso: string) {
  return Date.now() - new Date(iso).getTime() < DAY ? "Today" : "Earlier";
}

function InboxSkeleton() {
  return (
    <div
      className="space-y-1 p-1.5"
      role="status"
      aria-label="Loading notifications"
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex items-start gap-2.5 px-2 py-2.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading notifications...</span>
    </div>
  );
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: () => void;
}) {
  const Icon = kindIcons[notification.kind] ?? Bell;
  const unread = notification.readAt === null;
  const content = (
    <>
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          unread
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "leading-snug",
            unread ? "font-medium text-foreground" : "text-foreground/80",
          )}
        >
          {notification.title}
        </span>
        {notification.body && (
          <span className="text-xs leading-snug text-muted-foreground">
            {notification.body}
          </span>
        )}
        <span className="text-xs text-muted-foreground/80">
          {timeAgo(notification.createdAt)}
        </span>
      </span>
      {unread ? (
        <>
          <span
            className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
            aria-hidden="true"
          />
          <span className="sr-only">Unread</span>
        </>
      ) : null}
    </>
  );
  const className =
    "flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";

  // A notification with somewhere to go is a link, so it opens in a new tab and
  // shows its destination like any other. One without is still readable, and
  // reading it is the only thing it does.
  return notification.href ? (
    <Link className={className} href={notification.href} onClick={onOpen}>
      {content}
    </Link>
  ) : (
    <button className={className} onClick={onOpen} type="button">
      {content}
    </button>
  );
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(
    null,
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [reads, setReads] = useState(0);
  const [, startTransition] = useTransition();

  // Bumping the counter is the whole of "read the inbox again". Every caller is
  // an event handler, so nothing here sets state from inside the effect body,
  // and a reply that arrives after the bell has unmounted is dropped.
  const refresh = useCallback(() => setReads((count) => count + 1), []);

  // The count is the only thing on screen before the menu opens, so the first
  // read happens on mount. Opening rereads, because a run may have finished
  // while the page sat there.
  useEffect(() => {
    let cancelled = false;
    loadNotifications()
      .then((inbox) => {
        if (cancelled) return;
        setNotifications(inbox.notifications);
        setUnreadCount(inbox.unreadCount);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setNotifications([]);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reads]);

  function markRead(ids?: string[]) {
    // The row responds immediately; a failed write is corrected by the next
    // read rather than by an error the reader can do nothing about.
    setNotifications(
      (current) =>
        current?.map((item) =>
          item.readAt || (ids && !ids.includes(item.id))
            ? item
            : { ...item, readAt: new Date().toISOString() },
        ) ?? current,
    );
    setUnreadCount((current) => (ids ? Math.max(0, current - ids.length) : 0));
    startTransition(async () => {
      try {
        await markNotificationsRead(ids);
      } catch {
        refresh();
      }
    });
  }

  const loading = notifications === null;
  const label = unreadCount
    ? `Notifications, ${unreadCount} unread`
    : "Notifications";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative size-10 shrink-0 data-[state=open]:bg-accent data-[state=open]:text-foreground dark:data-[state=open]:bg-accent"
          aria-label={label}
        >
          <Bell aria-hidden="true" />
          {unreadCount > 0 && (
            // The count sits on the corner of the bell rather than across it,
            // and the ring keeps it legible against whatever the topbar is
            // doing behind. The button's label carries the number for a screen
            // reader, so the badge itself is decoration.
            <Badge
              variant="destructive"
              size="xs"
              radius="full"
              className="absolute top-0.5 right-0.5 px-1 ring-2 ring-background"
              aria-hidden="true"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-88 max-w-[calc(100vw-24px)] p-0"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Notifications"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => markRead()}
            >
              <CheckCheck aria-hidden="true" />
              Mark all as read
            </Button>
          )}
        </div>

        {loading ? (
          <InboxSkeleton />
        ) : failed ? (
          // ErrorState is a page-sized block with its own heading. Inline
          // failures in a panel use Empty, as course search does.
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AlertCircle />
              </EmptyMedia>
              <EmptyTitle>Notifications are unavailable</EmptyTitle>
              <EmptyDescription>
                Coursemap could not reach your inbox.
              </EmptyDescription>
            </EmptyHeader>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setNotifications(null);
                refresh();
              }}
            >
              Try again
            </Button>
          </Empty>
        ) : notifications.length === 0 ? (
          // The normal state for most people, so it reads as finished rather
          // than broken: no retry, no warning colour, no error tone.
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>You are all caught up</EmptyTitle>
              <EmptyDescription>
                Catalogue updates and changes to your plan arrive here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="[&_[data-slot=scroll-area-viewport]]:max-h-96 [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
            <ul className="flex flex-col p-1.5">
              {notifications.map((notification, index) => {
                const group = groupOf(notification.createdAt);
                const first =
                  index === 0 ||
                  groupOf(notifications[index - 1].createdAt) !== group;
                return (
                  <li key={notification.id}>
                    {first && (
                      <p
                        className={cn(
                          "px-2 pb-1 text-xs font-medium text-muted-foreground",
                          index > 0 && "pt-3",
                        )}
                      >
                        {group}
                      </p>
                    )}
                    <NotificationRow
                      notification={notification}
                      onOpen={() => {
                        if (!notification.readAt) markRead([notification.id]);
                        if (notification.href) setOpen(false);
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
