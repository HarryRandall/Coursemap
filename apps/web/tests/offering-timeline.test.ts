import { describe, expect, it } from "vitest";
import {
  offeringMilestones,
  offeringSpan,
  offeringStanding,
  offeringTermId,
  yearFraction,
} from "@/lib/coursemap/offering-timeline";

const semesterOne = {
  calendarYear: 2026,
  periodCode: "S1",
  periodName: "First Semester",
  startsOn: "2026-02-23",
  endsOn: "2026-05-29",
  enrolClosesOn: "2026-03-02",
  censusOn: "2026-03-31",
};

describe("offeringStanding", () => {
  it("names a start date while enrolment is a while off", () => {
    expect(offeringStanding(semesterOne, "2026-01-10")).toEqual({
      phase: "upcoming",
      label: "Starts 23 Feb",
    });
  });

  it("calls out enrolment closing within two weeks", () => {
    expect(offeringStanding(semesterOne, "2026-02-20")).toEqual({
      phase: "closing",
      label: "Enrolment closes in 10 days",
    });
  });

  it("keeps the enrolment deadline while the period has started", () => {
    expect(offeringStanding(semesterOne, "2026-02-25").label).toBe(
      "Running · enrol by 2 Mar",
    );
    expect(offeringStanding(semesterOne, "2026-04-01").label).toBe(
      "Running now",
    );
  });

  it("finishes the day after the period ends", () => {
    expect(offeringStanding(semesterOne, "2026-05-29").phase).toBe("running");
    expect(offeringStanding(semesterOne, "2026-05-30").phase).toBe("finished");
  });

  it("says enrolment has closed before a late-starting period", () => {
    expect(
      offeringStanding(
        { startsOn: "2026-09-21", endsOn: null, enrolClosesOn: "2026-09-01" },
        "2026-09-10",
      ),
    ).toEqual({ phase: "enrolment-closed", label: "Enrolment closed" });
  });

  it("stays quiet when no dates are known", () => {
    expect(
      offeringStanding(
        { startsOn: null, endsOn: null, enrolClosesOn: null },
        "2026-01-01",
      ),
    ).toEqual({ phase: "unknown", label: null });
  });
});

describe("offeringMilestones", () => {
  it("orders the dates and marks the passed ones", () => {
    expect(offeringMilestones(semesterOne, "2026-03-05")).toEqual([
      { key: "starts", label: "Starts", date: "2026-02-23", passed: true },
      {
        key: "enrol",
        label: "Last day to enrol",
        date: "2026-03-02",
        passed: true,
      },
      { key: "census", label: "Census", date: "2026-03-31", passed: false },
      { key: "ends", label: "Ends", date: "2026-05-29", passed: false },
    ]);
  });
});

describe("year strip", () => {
  it("places an offering inside the year", () => {
    const span = offeringSpan(semesterOne, 2026);
    expect(span?.start).toBeCloseTo(53 / 365, 5);
    expect(span?.end).toBeCloseTo(149 / 365, 5);
  });

  it("clips an offering that runs into the next year", () => {
    expect(
      offeringSpan({ startsOn: "2026-11-30", endsOn: "2027-02-10" }, 2026)?.end,
    ).toBe(1);
  });

  it("only marks today within the shown year", () => {
    expect(yearFraction("2026-01-01", 2026)).toBe(0);
    expect(yearFraction("2025-12-31", 2026)).toBeNull();
  });
});

describe("offeringTermId", () => {
  it("maps standard periods to planner terms", () => {
    expect(offeringTermId(semesterOne)).toBe("2026-s1");
    expect(offeringTermId({ calendarYear: 2026, periodCode: "spring" })).toBe(
      "2026-spring",
    );
    expect(offeringTermId({ calendarYear: 2026, periodCode: "X3" })).toBeNull();
  });
});
