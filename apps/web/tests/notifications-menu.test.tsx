import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { NotificationsMenu } from "../ui/shell/notifications-menu";

const inbox = vi.hoisted(() => ({
  loadNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
}));
vi.mock("@/lib/coursemap/notifications", () => inbox);

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    kind: "import_run",
    title: "Import run #7 completed",
    body: "3 records ready to review.",
    href: "/admin/courses/imports?run=7",
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  inbox.markNotificationsRead.mockResolvedValue(1);
});

test("an empty inbox reads as finished, not as a failure", async () => {
  inbox.loadNotifications.mockResolvedValue({
    notifications: [],
    unreadCount: 0,
  });
  const user = userEvent.setup();
  render(<NotificationsMenu />);

  const bell = screen.getByRole("button", { name: "Notifications" });
  await user.click(bell);

  expect(await screen.findByText("You are all caught up")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /mark all as read/i }),
  ).toBeNull();
});

test("the bell counts unread rows and opening does not mark them read", async () => {
  inbox.loadNotifications.mockResolvedValue({
    notifications: [
      notification(),
      notification({
        id: "risk-1",
        kind: "plan_risk",
        title: "COMP2400 lost its Semester 2 offering",
        body: null,
        href: null,
        readAt: new Date().toISOString(),
      }),
    ],
    unreadCount: 1,
  });
  const user = userEvent.setup();
  render(<NotificationsMenu />);

  const bell = await screen.findByRole("button", {
    name: "Notifications, 1 unread",
  });
  await user.click(bell);

  expect(
    await screen.findByText("Import run #7 completed"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("COMP2400 lost its Semester 2 offering"),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Unread")).toHaveLength(1);
  expect(inbox.markNotificationsRead).not.toHaveBeenCalled();
});

test("opening a notification marks that row read and clears the count", async () => {
  inbox.loadNotifications.mockResolvedValue({
    notifications: [notification()],
    unreadCount: 1,
  });
  const user = userEvent.setup();
  render(<NotificationsMenu />);

  await user.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  await user.click(
    await screen.findByRole("link", { name: /Import run #7 completed/ }),
  );

  expect(inbox.markNotificationsRead).toHaveBeenCalledWith(["run-1"]);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toBeInTheDocument(),
  );
});

test("mark all as read empties the count in one action", async () => {
  inbox.loadNotifications.mockResolvedValue({
    notifications: [notification(), notification({ id: "run-2" })],
    unreadCount: 2,
  });
  const user = userEvent.setup();
  render(<NotificationsMenu />);

  await user.click(
    await screen.findByRole("button", { name: "Notifications, 2 unread" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Mark all as read" }),
  );

  expect(inbox.markNotificationsRead).toHaveBeenCalledWith(undefined);
  expect(screen.queryByText("Unread")).toBeNull();
});

test("an unreachable inbox says so and offers another attempt", async () => {
  inbox.loadNotifications.mockRejectedValue(new Error("offline"));
  const user = userEvent.setup();
  render(<NotificationsMenu />);

  await user.click(screen.getByRole("button", { name: "Notifications" }));

  expect(
    await screen.findByText("Notifications are unavailable"),
  ).toBeInTheDocument();
  inbox.loadNotifications.mockResolvedValue({
    notifications: [],
    unreadCount: 0,
  });
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("You are all caught up")).toBeInTheDocument();
});
