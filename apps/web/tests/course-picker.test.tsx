import { afterEach, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Course, Term } from "@/lib/coursemap/types";
import { CoursePicker } from "@/ui/overlays/course-picker";

vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: { attempts: [], profile: { catalogueYear: 2026 } },
    addCourse: vi.fn(),
    notify: vi.fn(),
  }),
}));
vi.mock("@/ui/overlays/course-dialog", () => ({ CourseDialog: () => null }));

// cmdk scrolls the active option into view, which jsdom does not implement.
Element.prototype.scrollIntoView = () => {};

afterEach(() => vi.unstubAllGlobals());

// Each test uses its own year because the picker's page cache is shared.
function semester(year: number): Term {
  return {
    id: `${year}-s1`,
    year,
    name: "First Semester",
    shortName: "S1",
    dates: "",
  };
}

function course(code: string, name: string, year: number) {
  return {
    accent: "blue",
    code,
    convener: "Not listed",
    countsTowards: [],
    delivery: "In Person",
    description: "",
    incompatibilities: [],
    lastChanged: "Not listed",
    level: 1000,
    name,
    parseState: "Verified",
    prerequisiteCodes: [],
    prerequisiteText: "No prerequisites listed.",
    school: "School of Computing",
    sessions: ["First Semester"],
    sourceUrl: "",
    subject: code.slice(0, 4),
    units: 6,
    year,
  } as Course;
}

function resultPage(courses: Course[], page: number, total: number) {
  return {
    ok: true,
    json: async () => ({ courses, page, pageSize: 20, total }),
  };
}

function searchParams(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

test("keeps the previous results while a search loads and reuses earlier pages", async () => {
  const user = userEvent.setup();
  const programming = course(
    "COMP1100",
    "Programming as Problem Solving",
    2026,
  );
  const algorithms = course("COMP3600", "Algorithms", 2026);
  let finishSearch = () => {};
  const fetchCourses = vi.fn((url: string) => {
    if (searchParams(url).get("browse") === "1")
      return Promise.resolve(resultPage([programming], 1, 1));
    return new Promise((resolve) => {
      finishSearch = () => resolve(resultPage([algorithms], 1, 1));
    });
  });
  vi.stubGlobal("fetch", fetchCourses);
  render(<CoursePicker term={semester(2026)} onClose={() => {}} />);
  expect(await screen.findByText(programming.name)).toBeVisible();

  const search = screen.getByRole("combobox", { name: "Search 2026 courses" });
  await user.type(search, "algo");
  await waitFor(() =>
    expect(
      fetchCourses.mock.calls.some(
        ([url]) => searchParams(url).get("q") === "algo",
      ),
    ).toBe(true),
  );
  expect(screen.getByText(programming.name)).toBeInTheDocument();
  expect(screen.getByLabelText("Searching")).toBeInTheDocument();

  act(() => finishSearch());
  expect(await screen.findByText(algorithms.name)).toBeVisible();
  expect(screen.queryByText(programming.name)).not.toBeInTheDocument();

  const requests = fetchCourses.mock.calls.length;
  await user.clear(search);
  expect(screen.getByText(programming.name)).toBeVisible();
  expect(fetchCourses).toHaveBeenCalledTimes(requests);
});

test("loads the next page as the list end nears and drops repeated courses", async () => {
  const observers: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const first = course("ARTS1001", "Arts in Context", 2027);
  const repeated = course("BIOL1003", "Evolution, Ecology and Genetics", 2027);
  const last = course("CHEM1101", "Chemistry 1", 2027);
  const fetchCourses = vi.fn((url: string) =>
    Promise.resolve(
      searchParams(url).get("page") === "1"
        ? resultPage([first, repeated], 1, 21)
        : resultPage([repeated, last], 2, 21),
    ),
  );
  vi.stubGlobal("fetch", fetchCourses);
  render(<CoursePicker term={semester(2027)} onClose={() => {}} />);
  expect(await screen.findByText(repeated.name)).toBeVisible();
  await waitFor(() => expect(observers).not.toHaveLength(0));

  act(() =>
    observers.at(-1)!(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
  expect(await screen.findByText(last.name)).toBeVisible();
  expect(screen.getAllByText(repeated.name)).toHaveLength(1);
  const nextRequest = searchParams(fetchCourses.mock.calls.at(-1)![0]);
  expect(nextRequest.get("page")).toBe("2");
  expect(nextRequest.get("pageSize")).toBe("20");
  expect(
    screen.queryByRole("button", { name: "Load more courses" }),
  ).not.toBeInTheDocument();
});
