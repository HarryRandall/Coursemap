import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RuleMatchingCourses } from "@/ui/plan/rule-matching-courses";
import type { RuleToPlan } from "@/ui/plan/plan-suggestions";
import { courses } from "./fixtures/catalogue";

const [first, second, third] = courses;
const matching = {
  query: "year=2026&tag=Transdisciplinary+Problem-Solving",
  statusByCode: new Map([[second.code, "planned" as const]]),
};
const rule = {
  heading: "12 units tagged Transdisciplinary Problem-Solving",
} as RuleToPlan;

afterEach(() => vi.unstubAllGlobals());

test("a tag rule lists the courses it matches and leaves out planned ones", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        courses: [first, second],
        total: 3,
        nextCursor: "2",
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ courses: [third], total: 3, nextCursor: null }),
    });
  vi.stubGlobal("fetch", fetch);
  const onAdd = vi.fn();
  render(
    <RuleMatchingCourses
      rule={rule}
      matching={matching}
      kind="programme"
      onAdd={onAdd}
      onOpen={vi.fn()}
      onDragStart={vi.fn()}
      readOnly={false}
    />,
  );
  expect(await screen.findByText(first.code)).toBeInTheDocument();
  expect(screen.queryByText(second.code)).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    `/api/requirements/courses?${matching.query}&cursor=1`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show 1 more" }));
  expect(await screen.findByText(third.code)).toBeInTheDocument();
});
