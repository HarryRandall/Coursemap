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
    PlanBoard: ({ catalogue }: { catalogue: PlanCatalogue }) => {
      useEffect(() => {
        boards.mounts++;
      }, []);
      return (
        <p data-testid="codes">
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

  await act(async () => resolve([suggested]));
  expect(screen.getByTestId("codes").textContent).toBe(
    `${planned.code},${suggested.code}`,
  );
  expect(boards.mounts).toBe(1);
});

test("courses from a previous catalogue's promise are not shown with a new one", async () => {
  const first = Promise.resolve([suggested]);
  const { rerender } = render(
    <PlanClient catalogue={catalogue} requirementCourses={first} />,
  );
  await act(async () => first);
  expect(screen.getByTestId("codes").textContent).toContain(suggested.code);

  rerender(
    <PlanClient
      catalogue={catalogue}
      requirementCourses={new Promise<Course[]>(() => undefined)}
    />,
  );
  expect(screen.getByTestId("codes").textContent).toBe(planned.code);
});
