import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { CalendarFilters } from "@/ui/key-dates/calendar-filters";
import { StudyCalendar } from "@/app/calendar/study-calendar";
import { EXAMPLE_SOCIETY_EVENTS } from "@/tests/fixtures/societies";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";

import type { CalendarEvent } from "@coursemap/ui/components/event-calendar/event-calendar-types";

const calendar = vi.hoisted(() => ({ events: [] as CalendarEvent[] }));

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
      profile: {
        degreeCode: "BCOMP",
        commencementYear: 2026,
        extensionYears: 0,
      },
      attempts: [{ termId: "2026-s2" }, { termId: "2026-s2" }],
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
    events: CalendarEvent[];
    onEventClick: (value: unknown) => void;
  }) => {
    calendar.events = events;
    return (
      <div>
        {children}
        {events.map((event) => (
          <button key={event.id} onClick={() => onEventClick({ event })}>
            {event.title}
          </button>
        ))}
      </div>
    );
  },
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

test("study periods produce one-day start and end markers with course counts", () => {
  const catalogue: PlanCatalogue = {
    academicYear: 2026,
    courses: [],
    majors: [],
    structures: [],
    programmeRequirementsImported: false,
    structureRequirements: [],
    degrees: [
      {
        code: "BCOMP",
        name: "Computing",
        units: 48,
        duration: 1,
        college: null,
        description: "",
      },
    ],
    terms: [
      {
        id: "2026-s2",
        year: 2026,
        name: "Second Semester",
        shortName: "S2",
        dates: "",
        startsOn: "2026-07-20",
        endsOn: "2026-10-30",
      },
      {
        id: "2026-spring",
        year: 2026,
        name: "Spring Session",
        shortName: "Spring",
        dates: "",
        startsOn: "2026-10-01",
        endsOn: "2026-12-31",
      },
      {
        id: "2026-pending",
        year: 2026,
        name: "Pending",
        shortName: "Pending",
        dates: "",
      },
    ],
  };
  render(
    <TooltipProvider>
      <StudyCalendar
        catalogue={catalogue}
        keyDates={[
          { id: 1, date: "2026-10-09", title: "Last day to drop courses" },
        ]}
        societyEvents={[]}
      />
    </TooltipProvider>,
  );
  const terms = calendar.events.filter((event) => event.id.startsWith("term-"));
  expect(terms.map((event) => event.title)).toEqual([
    "Second Semester 2026 starts · 2 courses",
    "Second Semester 2026 ends · 2 courses",
    "Spring Session 2026 starts",
    "Spring Session 2026 ends",
  ]);
  expect(new Set(terms.map((event) => event.id)).size).toBe(4);
  expect(
    terms.map((event) => new Date(event.start.getTime()).toISOString()),
  ).toEqual([
    "2026-07-19T14:00:00.000Z",
    "2026-10-29T13:00:00.000Z",
    "2026-09-30T14:00:00.000Z",
    "2026-12-30T13:00:00.000Z",
  ]);
  for (const event of terms) {
    expect(event.allDay).toBe(true);
    expect(event.readOnly).toBe(true);
    expect(event.end.getTime() - event.start.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  }
  expect(
    calendar.events.find((event) => event.id === "key-date-1")?.title,
  ).toBe("Last day to drop courses");
});
