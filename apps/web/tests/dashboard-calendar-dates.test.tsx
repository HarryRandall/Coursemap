import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { MonthCalendar } from "@/ui/dashboard/month-calendar";

afterEach(() => vi.useRealTimers());
test("the calendar uses the page's Sydney date rather than the browser clock", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T13:00:00Z"));
  render(<MonthCalendar todayIso="2026-10-01" events={[]} />);
  expect(
    screen.getByRole("heading", { name: "October 2026" }),
  ).toBeInTheDocument();
});
