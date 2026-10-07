import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Tabs } from "@coursemap/ui/primitives/tabs";
import { usePublishedSurvey } from "../lib/course-surveys/use-published-survey";
import { CourseDetailTabsList } from "../ui/courses/course-detail-view";
afterEach(() => vi.unstubAllGlobals());
it("hides Student review unless a published report is available", () => {
  const view = render(
    <Tabs>
      <CourseDetailTabsList />
    </Tabs>,
  );
  expect(
    screen.queryByRole("tab", { name: "Student review" }),
  ).not.toBeInTheDocument();
  view.rerender(
    <Tabs>
      <CourseDetailTabsList showStudentReview />
    </Tabs>,
  );
  expect(screen.getByRole("tab", { name: "Student review" })).toBeVisible();
});
it("keeps missing and empty reports hidden and clears the previous course immediately", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ report: { courseCode: "COMP1100", surveys: [{}] } }),
    )
    .mockResolvedValueOnce(
      Response.json({ report: { courseCode: "COMP2310", surveys: [] } }),
    );
  vi.stubGlobal("fetch", fetcher);
  const view = renderHook(({ code }) => usePublishedSurvey(code), {
    initialProps: { code: "COMP1100" },
  });
  expect(view.result.current).toBeNull();
  await waitFor(() => expect(view.result.current?.courseCode).toBe("COMP1100"));
  view.rerender({ code: "COMP2310" });
  expect(view.result.current).toBeNull();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(view.result.current).toBeNull();
});
it("keeps the tab hidden when report loading fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  );
  const view = renderHook(() => usePublishedSurvey("COMP1100"));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(view.result.current).toBeNull();
});
