import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Course } from "@/lib/coursemap/types";
import { PlanClient } from "@/app/plan/plan-client";
import { courses } from "./fixtures/catalogue";

const boards = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("@/ui/plan/plan-board", async () => {
  const { useEffect } = await import("react");
  return {
    PlanBoard: ({
      catalogue,
      suggestionsLoading,
    }: {
      catalogue: PlanCatalogue;
      suggestionsLoading: boolean;
    }) => {
      useEffect(() => {
        boards.mounts++;
      }, []);
      return (
        <p data-testid="codes" aria-busy={suggestionsLoading}>
          {catalogue.courses.map((course) => course.code).join(",")}
        </p>
      );
    },
  };
});

const [planned, suggested] = courses;
const catalogue = {
  academicYear: 2026,
  courses: [planned],
  terms: [],
  degrees: [],
  majors: [],
  structures: [],
  programmeRequirementsImported: false,
  structureRequirements: [],
} satisfies PlanCatalogue;

test("the board renders before requirement courses arrive, then gains them without remounting", async () => {
  let resolve: (courses: Course[]) => void = () => undefined;
  const requirementCourses = new Promise<Course[]>((done) => {
    resolve = done;
  });
  render(
    <PlanClient
      catalogue={catalogue}
      requirementCourses={requirementCourses}
    />,
  );
  expect(screen.getByTestId("codes").textContent).toBe(planned.code);
  expect(screen.getByTestId("codes")).toHaveAttribute("aria-busy", "true");

  await act(async () => resolve([suggested]));
  expect(screen.getByTestId("codes").textContent).toBe(
    `${planned.code},${suggested.code}`,
  );
  expect(boards.mounts).toBe(1);
  expect(screen.getByTestId("codes")).toHaveAttribute("aria-busy", "false");
});

test("a revalidated page keeps the previous courses until the new ones arrive", async () => {
  const [, , replacement] = courses;
  const first = Promise.resolve([suggested]);
  const { rerender } = render(
    <PlanClient catalogue={catalogue} requirementCourses={first} />,
  );
  await act(async () => first);
  expect(screen.getByTestId("codes").textContent).toContain(suggested.code);

  let resolve: (courses: Course[]) => void = () => undefined;
  const next = new Promise<Course[]>((done) => {
    resolve = done;
  });
  rerender(
    <PlanClient catalogue={{ ...catalogue }} requirementCourses={next} />,
  );
  expect(screen.getByTestId("codes").textContent).toBe(
    `${planned.code},${suggested.code}`,
  );
  expect(screen.getByTestId("codes")).toHaveAttribute("aria-busy", "false");

  await act(async () => resolve([replacement]));
  expect(screen.getByTestId("codes").textContent).toBe(
    `${planned.code},${replacement.code}`,
  );
});

test("held-over courses the new catalogue already lists do not double", async () => {
  const first = Promise.resolve([suggested]);
  const { rerender } = render(
    <PlanClient catalogue={catalogue} requirementCourses={first} />,
  );
  await act(async () => first);

  rerender(
    <PlanClient
      catalogue={{ ...catalogue, courses: [planned, suggested] }}
      requirementCourses={new Promise<Course[]>(() => undefined)}
    />,
  );
  expect(screen.getByTestId("codes").textContent).toBe(
    `${planned.code},${suggested.code}`,
  );
});

test("an empty suggestions response finishes loading", async () => {
  const requirementCourses = Promise.resolve([]);
  render(
    <PlanClient
      catalogue={catalogue}
      requirementCourses={requirementCourses}
    />,
  );
  await act(async () => requirementCourses);
  expect(screen.getByTestId("codes")).toHaveAttribute("aria-busy", "false");
});
