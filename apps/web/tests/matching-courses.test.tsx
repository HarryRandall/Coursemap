import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchingCourses } from "@/ui/requirements/matching-courses";
import { RequirementCondition } from "@/ui/requirements/requirement-condition";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import { clarityCourse, clarityRule } from "./fixtures/requirement-clarity";

const { toggleStar } = vi.hoisted(() => ({
  toggleStar: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: { starredCourses: [] },
    toggleStar,
    notify: vi.fn(),
  }),
}));
const context = readingTreeContext({ academicYear: 2025 });
afterEach(() => vi.unstubAllGlobals());

function response(codes: string[], total: number, nextCursor: string | null) {
  return {
    ok: true,
    json: async () => ({
      courses: codes.map((code) => ({ ...clarityCourse(code), year: 2025 })),
      total,
      nextCursor,
    }),
  };
}

test("rule expansion loads the selected year, paginates and caches catalogue rows", async () => {
  const user = userEvent.setup();
  const fetchCourses = vi
    .fn()
    .mockResolvedValueOnce(response(["COMP2100"], 2, "2"))
    .mockResolvedValueOnce(response(["COMP3100"], 2, null));
  vi.stubGlobal("fetch", fetchCourses);
  const rule = clarityRule({
    conditionKind: "subject_units",
    subjectCode: "COMP",
    minimumLevel: 2000,
    maximumLevel: 3000,
    options: [],
  });
  render(<RequirementCondition condition={rule} context={context} />);
  expect(fetchCourses).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /View courses/ }));
  expect(await screen.findByText("2 matching courses")).toBeVisible();
  const url = new URL(fetchCourses.mock.calls[0]![0], "http://localhost");
  expect(url.searchParams.get("year")).toBe("2025");
  expect(url.searchParams.get("level")).toBe("2-3");
  expect(url.searchParams.get("subject")).toBe("COMP");
  expect(screen.getByRole("link", { name: /COMP2100/ })).toHaveAttribute(
    "href",
    "/courses/2025/comp2100",
  );
  await user.click(screen.getByRole("button", { name: "Show 1 more" }));
  expect(await screen.findByRole("link", { name: /COMP3100/ })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Show .* more/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Hide courses/ }));
  await user.click(screen.getByRole("button", { name: /View courses/ }));
  await screen.findByText("2 matching courses");
  expect(fetchCourses).toHaveBeenCalledTimes(2);
});

test("failed requests can be retried and an empty year is explicit", async () => {
  const user = userEvent.setup();
  const fetchCourses = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce(response([], 0, null));
  vi.stubGlobal("fetch", fetchCourses);
  render(
    <MatchingCourses
      condition={clarityRule({
        conditionKind: "tagged_units",
        tag: "Empty test tag",
        options: [],
      })}
      context={context}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Matching courses could not be loaded.",
  );
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByText("No matching courses are published for 2025."),
  ).toBeVisible();
  expect(fetchCourses).toHaveBeenCalledTimes(2);
});

test("unbounded electives retain their year without fetching", () => {
  const fetchCourses = vi.fn();
  vi.stubGlobal("fetch", fetchCourses);
  render(
    <MatchingCourses
      condition={clarityRule({
        conditionKind: "level_units",
        minimumLevel: null,
        maximumLevel: 3000,
        options: [],
      })}
      context={context}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Browse elective courses" }),
  ).toHaveAttribute("href", "/courses?year=2025&level=1-3");
  expect(fetchCourses).not.toHaveBeenCalled();
});

test("changing the year does not display the previous response", async () => {
  let resolveFirst!: (value: ReturnType<typeof response>) => void;
  const first = new Promise<ReturnType<typeof response>>((resolve) => {
    resolveFirst = resolve;
  });
  const fetchCourses = vi
    .fn()
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce(response([], 0, null));
  vi.stubGlobal("fetch", fetchCourses);
  const rule = clarityRule({
    conditionKind: "tagged_units",
    tag: "Year change test",
    options: [],
  });
  const { rerender } = render(
    <MatchingCourses condition={rule} context={context} />,
  );
  rerender(
    <MatchingCourses
      condition={rule}
      context={readingTreeContext({ academicYear: 2024 })}
    />,
  );
  await screen.findByText("No matching courses are published for 2024.");
  resolveFirst(response(["COMP1100"], 1, null));
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: /COMP1100/ }),
    ).not.toBeInTheDocument(),
  );
});

test("inline rows retain completed status and support star and add", async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(response(["COMP2100", "COMP3100"], 2, null)),
  );
  render(
    <MatchingCourses
      condition={clarityRule({
        conditionKind: "subject_units",
        subjectCode: "COMP",
        options: [],
        maximumLevel: 4000,
      })}
      context={{
        ...context,
        showPlanProgress: true,
        attemptStatusByCode: new Map([["COMP2100", "completed"]]),
        onAddCourse: onAdd,
      }}
    />,
  );
  const completed = (
    await screen.findByRole("link", { name: /COMP2100/ })
  ).closest("li")!;
  expect(within(completed).getByText("Completed")).toBeVisible();
  expect(
    within(completed).queryByRole("button", { name: /Add/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Star COMP3100" }));
  expect(toggleStar).toHaveBeenCalledWith("COMP3100");
  await user.click(
    screen.getByRole("button", { name: "Add COMP3100 to plan" }),
  );
  expect(onAdd).toHaveBeenCalledWith(
    expect.objectContaining({ code: "COMP3100", year: 2025 }),
  );
});
