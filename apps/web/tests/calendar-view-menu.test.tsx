import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { EventCalendar } from "@coursemap/ui/components/event-calendar/event-calendar";
import {
  EventCalendarNav,
  EventCalendarViewSwitcher,
} from "@coursemap/ui/components/event-calendar/event-calendar-nav";

test("offers only the available views and returns focus after keyboard selection", async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <EventCalendar
        events={[]}
        defaultView="month"
        views={["month", "agenda"]}
      >
        <EventCalendarNav>
          <EventCalendarViewSwitcher />
        </EventCalendarNav>
      </EventCalendar>
    </TooltipProvider>,
  );
  const trigger = screen.getByRole("button", { name: "Select view" });
  await user.click(trigger);
  const menu = screen.getByRole("menu");
  expect(within(menu).queryByText("Select view")).toBeNull();
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
  await user.keyboard("{End}{Enter}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(trigger).toHaveTextContent("Agenda");
  expect(trigger).toHaveFocus();
});
