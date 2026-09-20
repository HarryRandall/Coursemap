"use server";

import { getAuthViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export type Notification = {
  id: string;
  /**
   * The database constraint decides which kinds exist. The bell draws the ones
   * it recognises with their own icon and anything newer with the bell itself,
   * so a row added by a later migration is never invisible to an older client.
   */
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationInbox = {
  notifications: Notification[];
  /** Unread rows across the whole inbox, not only the page that was read. */
  unreadCount: number;
};

/** One screenful. The bell is a glance, not a history. */
const INBOX_LIMIT = 20;

/**
 * A signed-out visitor, and a deployment with no Supabase configured, both have
 * an empty inbox rather than a failure. The bell sits in the shell on every
 * page, so it must stay quiet where there is nobody to notify.
 */
const EMPTY_INBOX: NotificationInbox = { notifications: [], unreadCount: 0 };

/**
 * The newest notifications belonging to the signed-in user. Own-row policies do
 * the filtering, so this never names a user; a request without a session simply
 * reads nothing.
 */
export async function loadNotifications(): Promise<NotificationInbox> {
  if (!(await getAuthViewer())) return EMPTY_INBOX;
  const supabase = await createClient();

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,kind,title,body,href,read_at,created_at")
      .order("created_at", { ascending: false })
      .limit(INBOX_LIMIT),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  if (error) throw error;
  if (countError) throw countError;

  return {
    notifications: (data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      href: row.href,
      readAt: row.read_at,
      createdAt: row.created_at,
    })),
    unreadCount: count ?? 0,
  };
}

/**
 * Marks notifications read. Omitting the ids marks every unread row. The
 * database function scopes the update to the caller, so the ids are a
 * narrowing rather than a permission.
 */
export async function markNotificationsRead(
  notificationIds?: string[],
): Promise<number> {
  if (!(await getAuthViewer())) return 0;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", {
    p_notification_ids: notificationIds,
  });
  if (error) throw error;
  return data ?? 0;
}
