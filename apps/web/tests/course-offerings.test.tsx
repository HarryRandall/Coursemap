import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { CourseOffering } from "@/lib/coursemap/course-types";
import type { Attempt } from "@/lib/coursemap/types";
import { CourseOfferings } from "@/ui/courses/course-offerings";

vi.mock("@/lib/canberra-format", () => ({
  canberraTodayIso: () => "2026-09-14",
}));

const offering = (
  periodCode: string,
  periodName: string,
  classNumber: string,
  [startsOn, enrolClosesOn, censusOn, endsOn]: string[],
): CourseOffering => ({
  calendarYear: 2026,
  censusOn: censusOn!,
  classNumber,
  classSummaryUrl: `https://example.test/${classNumber}`,
  deliveryMode: "In Person",
  endsOn: endsOn!,
  enrolClosesOn: enrolClosesOn!,
  location: null,
  periodCode,
  periodName,
  startsOn: startsOn!,
});

/** STAT1008 in 2026, as ANU lists it. */
const offerings = [
  offering("S1", "First Semester", "2941", [
    "2026-02-23",
    "2026-03-02",
    "2026-03-31",
    "2026-05-29",
  ]),
  offering("S2", "Second Semester", "7912", [
    "2026-07-27",
    "2026-08-03",
    "2026-08-31",
    "2026-10-30",
  ]),
  offering("SPRING", "Spring Session", "9395", [
    "2026-09-21",
    "2026-09-21",
    "2026-10-26",
    "2026-12-04",
  ]),
];

function renderOfferings(attempts: Attempt[] = [], onAddToPeriod = vi.fn()) {
  render(
    <CourseOfferings
      attempts={attempts}
      course={{
        code: "STAT1008",
        offerings,
        offeringStatus: "offered",
        year: 2026,
      }}
      onAddToPeriod={onAddToPeriod}
    />,
  );
  return onAddToPeriod;
}

it("leads with the periods still ahead and folds the finished one away", async () => {
  renderOfferings();
  const second = screen.getByRole("region", { name: "Second Semester" });
  expect(second).toHaveTextContent("Running now");
  expect(
    screen.getByRole("region", { name: "Spring Session" }),
  ).toHaveTextContent("Enrolment closes in 7 days");
  expect(
    screen.queryByRole("region", { name: "First Semester" }),
  ).not.toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Show 1 finished period" }));
  expect(
    screen.getByRole("region", { name: "First Semester" }),
  ).toHaveTextContent("Finished");
});

it("adds the course straight into a period's planner term", async () => {
  const onAdd = renderOfferings();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Add to Spring" }));
  expect(onAdd).toHaveBeenCalledWith("2026-spring");
});

it("marks the period the course is planned in and offers no other adds", () => {
  renderOfferings([
    {
      id: "a",
      academicYear: 2026,
      courseCode: "STAT1008",
      termId: "2026-s2",
      status: "planned",
    } as Attempt,
  ]);
  expect(
    screen.getByRole("region", { name: "Second Semester" }),
  ).toHaveTextContent("In your plan");
  expect(
    screen.queryByRole("button", { name: /^Add to/u }),
  ).not.toBeInTheDocument();
});
