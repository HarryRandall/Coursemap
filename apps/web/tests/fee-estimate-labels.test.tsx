import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { describe, expect, it, vi } from "vitest";
import type { FeeEstimate } from "@/lib/academic/fee-estimates";
import type { FeeStatus } from "@/lib/academic/fee-status";
import type { TuitionEstimate } from "@/lib/coursemap/academic-metrics";
import type { Course } from "@/lib/coursemap/types";
import { TuitionMetric } from "@/ui/dashboard/tuition-metric";
import { CourseAbout } from "@/ui/overlays/course-about";
import { courses } from "./fixtures/catalogue";

const profile = vi.hoisted(() => ({
  feeStatus: "domestic_fee" as FeeStatus,
  commencementYear: 2025,
}));
vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({ state: { attempts: [], profile } }),
}));

const estimate: FeeEstimate = {
  perUnit: 818,
  scope: "subject",
  scopeValue: "COMP",
  sampleSize: 12,
};

function courseWith(prices: Course["prices"]): Course {
  return { ...courses[0], convener: "", prices };
}

function renderAbout(course: Course) {
  return render(
    <CourseAbout course={course} details={{ status: "error", details: null }}>
      {null}
    </CourseAbout>,
  );
}

describe("CourseAbout fee", () => {
  it("labels an estimated fee and says it isn't official", () => {
    renderAbout(
      courseWith({
        domestic: null,
        international: 7000,
        contributionBand: 2,
        estimates: { domestic: estimate },
      }),
    );
    expect(
      screen.getByText(/≈ \$4,910 Domestic fee, estimated/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Estimated from the median of 12 similar COMP courses. ANU's page didn't list a fee we could read, so this isn't the official fee.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a listed fee without any estimate wording", () => {
    renderAbout(
      courseWith({ domestic: 5000, international: 7000, contributionBand: 2 }),
    );
    expect(screen.getByText(/\$5,000 Domestic fee/)).toBeInTheDocument();
    expect(screen.queryByText(/estimated/i)).not.toBeInTheDocument();
    expect(screen.queryByText("≈", { exact: false })).not.toBeInTheDocument();
  });
});

describe("TuitionMetric", () => {
  const tuition: TuitionEstimate = {
    total: 7310,
    feeStatus: "domestic_fee",
    pricedCourses: 2,
    estimatedCourses: 1,
    plannedCourses: 2,
    byYear: [{ year: 2026, amount: 7310, courses: 2, estimatedCourses: 1 }],
  };

  it("marks a total that includes estimates and explains them", async () => {
    render(
      <TooltipProvider>
        <TuitionMetric tuition={tuition} />
      </TooltipProvider>,
    );
    expect(screen.getByText("≈ $7,310", { selector: "p" })).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", {
        name: "2026: about $7,310 across 2 courses, 1 estimated",
      }),
    ).toBeInTheDocument();
    await userEvent.hover(
      screen.getByRole("button", { name: "Includes estimates" }),
    );
    expect(
      (
        await screen.findAllByText(
          "ANU didn't list a fee we could read for 1 course, so it is priced from similar courses. These are estimates, not official fees.",
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("shows no estimate marker when every fee was listed", () => {
    render(
      <TooltipProvider>
        <TuitionMetric
          tuition={{
            ...tuition,
            estimatedCourses: 0,
            byYear: [{ ...tuition.byYear[0], estimatedCourses: 0 }],
          }}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("$7,310", { selector: "p" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Includes estimates" }),
    ).not.toBeInTheDocument();
  });
});
