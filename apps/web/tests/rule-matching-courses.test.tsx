import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

test("a tag rule suggests the courses it matches, leaves out planned ones and pages through the rest", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "Show all 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Show 1 more" }));
  expect(await screen.findByText(third.code)).toBeInTheDocument();
});

test("showing all of a rule's courses brings a search that asks the catalogue for matches", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ courses: [first], total: 20, nextCursor: "2" }),
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <RuleMatchingCourses
      rule={rule}
      matching={{ ...matching, query: "year=2026&subject=COMP" }}
      kind="programme"
      onAdd={vi.fn()}
      onOpen={vi.fn()}
      onDragStart={vi.fn()}
      readOnly={false}
    />,
  );
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Show all 20" }));
  fireEvent.change(
    screen.getByRole("searchbox", { name: `Search ${rule.heading}` }),
    { target: { value: "design" } },
  );
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/requirements/courses?year=2026&subject=COMP&q=design&cursor=1",
    ),
  );
});
