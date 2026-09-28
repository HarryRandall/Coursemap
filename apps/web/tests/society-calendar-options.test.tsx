import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { CalendarFilters } from "@/ui/key-dates/calendar-filters";
import { StudyCalendar } from "@/app/calendar/study-calendar";
import { EXAMPLE_SOCIETY_EVENTS } from "@/tests/fixtures/societies";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";

const navigation = vi.hoisted(() => ({
  query: "",
  pathname: "/key-dates",
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));
vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: {
      profile: { degreeCode: "", commencementYear: 2026, extensionYears: 0 },
      attempts: [],
    },
  }),
}));
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@coursemap/ui/components/event-calendar/event-calendar", () => ({
  EventCalendar: ({
    events,
    onEventClick,
    children,
  }: {
    children: React.ReactNode;
    events: Array<{ id: string; title: string }>;
    onEventClick: (value: unknown) => void;
  }) => (
    <div>
      {children}
      {events.map((event) => (
        <button key={event.id} onClick={() => onEventClick({ event })}>
          {event.title}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@coursemap/ui/components/event-calendar/event-calendar-nav", () => ({
  EventCalendarNav: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  EventCalendarNavToday: () => null,
  EventCalendarNavPrev: () => null,
  EventCalendarNavNext: () => null,
  EventCalendarTitle: () => null,
  EventCalendarViewSwitcher: () => null,
}));
vi.mock(
  "@coursemap/ui/components/event-calendar/event-calendar-content",
  () => ({ EventCalendarContent: () => null }),
);
afterEach(() => {
  cleanup();
  navigation.query = "";
  navigation.pathname = "/key-dates";
  navigation.push.mockReset();
  navigation.replace.mockReset();
});

test("key dates enable societies through the filter menu and clear their dependent category when removed", async () => {
  const view = () => (
    <TooltipProvider>
      <CalendarFilters />
    </TooltipProvider>
  );
  const { rerender } = render(view());
  const user = userEvent.setup();
  expect(screen.queryByRole("button", { name: "Society events" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Society events" }));
  expect(screen.getByRole("button", { name: "Off" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "On" }));
  expect(navigation.replace).toHaveBeenLastCalledWith(
    "/key-dates?societies=1",
    {
      scroll: false,
    },
  );
  navigation.query = "societies=1&category=societies&year=2026&q=panel";
  rerender(view());
  await user.click(
    screen.getByRole("button", { name: "Remove the Society events filter" }),
  );
  expect(navigation.replace).toHaveBeenLastCalledWith(
    "/key-dates?year=2026&q=panel",
    { scroll: false },
  );
});

test("calendar filters hide societies by default and preserve detail navigation", async () => {
  navigation.pathname = "/calendar";
  const catalogue = { degrees: [], terms: [] } as unknown as PlanCatalogue;
  const view = () => (
    <TooltipProvider>
      <StudyCalendar
        catalogue={catalogue}
        keyDates={[]}
        societyEvents={EXAMPLE_SOCIETY_EVENTS}
      />
    </TooltipProvider>
  );
  const { rerender } = render(view());
  const user = userEvent.setup();
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByText(/Team Finding Mixer/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Society events" }));
  await user.click(screen.getByRole("button", { name: "On" }));
  expect(navigation.replace).toHaveBeenLastCalledWith("/calendar?societies=1", {
    scroll: false,
  });
  navigation.query = "societies=1";
  rerender(view());
  const event = EXAMPLE_SOCIETY_EVENTS[1]!;
  fireEvent.click(
    screen.getByRole("button", { name: `${event.title} · ${event.host}` }),
  );
  expect(navigation.push).toHaveBeenLastCalledWith(
    `/societies/events/${event.id}`,
  );
  navigation.query = "societies=1&category=teaching&q=team";
  rerender(view());
  expect(screen.queryByText(/Team Finding Mixer/)).not.toBeInTheDocument();
  navigation.query = "";
  rerender(view());
  expect(screen.queryByText(/Team Finding Mixer/)).not.toBeInTheDocument();
});
