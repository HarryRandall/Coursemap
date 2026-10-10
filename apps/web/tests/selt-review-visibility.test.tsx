import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Tabs } from "@coursemap/ui/primitives/tabs";
import { usePublishedSurvey } from "../lib/course-surveys/use-published-survey";
import { CourseDetailTabsList } from "../ui/courses/course-detail-view";
afterEach(() => vi.unstubAllGlobals());
it("hides Student review only when no published report is available", () => {
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
it("distinguishes loading, published reports with no periods and a missing report, clearing the previous course immediately", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ report: { courseCode: "COMP1100", surveys: [{}] } }),
    )
    .mockResolvedValueOnce(
      Response.json({ report: { courseCode: "COMP2310", surveys: [] } }),
    )
    .mockResolvedValueOnce(Response.json({ report: null }));
  vi.stubGlobal("fetch", fetcher);
  const view = renderHook(({ code }) => usePublishedSurvey(code), {
    initialProps: { code: "COMP1100" },
  });
  expect(view.result.current.status).toBe("loading");
  await waitFor(() =>
    expect(view.result.current.report?.courseCode).toBe("COMP1100"),
  );
  view.rerender({ code: "COMP2310" });
  expect(view.result.current.status).toBe("loading");
  expect(view.result.current.report).toBeNull();
  await waitFor(() => expect(view.result.current.status).toBe("ready"));
  expect(view.result.current.report?.surveys).toEqual([]);
  view.rerender({ code: "COMP1110" });
  await waitFor(() => expect(view.result.current.status).toBe("empty"));
  expect(view.result.current.report).toBeNull();
});
it.each(["http", "network", "json", "payload"])(
  "exposes a retryable error for a %s failure",
  async (failure) => {
    const fetcher = vi.fn();
    if (failure === "http")
      fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    else if (failure === "network")
      fetcher.mockRejectedValueOnce(new Error("Offline"));
    else if (failure === "payload")
      fetcher.mockResolvedValueOnce(Response.json({}));
    else fetcher.mockResolvedValueOnce(new Response("invalid json"));
    fetcher.mockResolvedValueOnce(Response.json({ report: null }));
    vi.stubGlobal("fetch", fetcher);
    const view = renderHook(() => usePublishedSurvey("COMP1100"));
    await waitFor(() => expect(view.result.current.status).toBe("error"));
    act(() => {
      if (view.result.current.status === "error") view.result.current.retry();
    });
    expect(view.result.current.status).toBe("loading");
    await waitFor(() => expect(view.result.current.status).toBe("empty"));
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
it("ignores a late response after switching courses", async () => {
  let resolveFirst!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json({ report: null }));
  vi.stubGlobal("fetch", fetcher);
  const view = renderHook(({ code }) => usePublishedSurvey(code), {
    initialProps: { code: "COMP1100" },
  });
  view.rerender({ code: "COMP2310" });
  await waitFor(() => expect(view.result.current.status).toBe("empty"));
  await act(async () =>
    resolveFirst(
      Response.json({ report: { courseCode: "COMP1100", surveys: [{}] } }),
    ),
  );
  expect(view.result.current.status).toBe("empty");
  expect(view.result.current.report).toBeNull();
});
