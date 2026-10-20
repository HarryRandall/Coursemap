import { expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RequirementsTable } from "@/ui/dashboard/requirements-table";
import type { RequirementBucketProgress } from "@/lib/coursemap/requirement-progress";

const bucket: RequirementBucketProgress = {
  key: "td",
  title: "Transdisciplinary Problem-Solving",
  description: "Complete 12 units of designated courses.",
  kind: "Requirement",
  targetUnits: 12,
  completedUnits: 6,
  plannedUnits: 0,
  designationReview: {
    unknownUnits: 6,
    affectsResult: true,
    detail:
      "6 completed units need their transdisciplinary designation checked.",
  },
};

test("dashboard distinguishes a designation review from a definite shortfall", () => {
  render(<RequirementsTable buckets={[bucket]} />);
  const row = screen.getByRole("row", {
    name: /Transdisciplinary Problem-Solving/,
  });
  expect(within(row).getByText("Review designation")).toBeVisible();
  expect(within(row).getByText(bucket.designationReview!.detail)).toBeVisible();
  expect(within(row).getByRole("cell", { name: "6" })).toBeVisible();
  expect(within(row).queryByText(/short/)).not.toBeInTheDocument();
});

test("a manual requirement override retains its satisfied status", () => {
  render(
    <RequirementsTable buckets={[{ ...bucket, satisfiedByOverride: true }]} />,
  );
  expect(screen.getByText("Marked satisfied")).toBeVisible();
  expect(screen.queryByText("Review designation")).not.toBeInTheDocument();
  expect(
    screen.queryByText(bucket.designationReview!.detail),
  ).not.toBeInTheDocument();
});
