import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { CourseRunHeader } from "../ui/admin/catalogue/course-run-progress";
import { CourseImportWorkspace } from "../ui/admin/catalogue/course-import-workspace";

vi.mock("@/ui/shell", () => ({
  AppShell: ({
    children,
    tabs,
  }: {
    children: React.ReactNode;
    tabs?: React.ReactNode;
  }) => (
    <>
      <div>{tabs}</div>
      {children}
    </>
  ),
}));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/admin/operations/catalogue/imports/test",
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("shows a 100-course default, automatically previews costs before enabling Start", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (!options) return Response.json({ runs: [] });
      const body = JSON.parse(options.body as string);
      requests.push(body);
      return Response.json(
        body.action === "preview"
          ? {
              count: 100,
              availableCount: 1000,
              minimumUsd: 0,
              estimatedUsd: 0.149325,
              estimateKind: "provisional",
              estimateBasis: "One sample.",
              model: "google/gemini-3.1-flash-lite",
              maximumUsd: 0.725,
              budgetUsd: 0.5,
            }
          : { runId: "test-run" },
      );
    }),
  );
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CourseImportWorkspace year={2026} />
    </TooltipProvider>,
  );
  expect(screen.getByLabelText("Exact course count")).toHaveValue(100);
  expect(screen.getByLabelText("Spending limit")).toHaveValue(0.5);
  expect(
    screen.getByRole("button", { name: /Import \d+ courses/ }),
  ).toBeDisabled();
  await screen.findByText("US$0.73");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "May pause at your US$0.50 spending limit.",
  );
  expect(requests[0]).toMatchObject({
    year: 2026,
  });
  await user.click(screen.getByRole("button", { name: /Import \d+ courses/ }));
  await waitFor(() =>
    expect(requests[1]).toMatchObject({ action: "create", limit: 100 }),
  );
  expect(window.location.pathname).toBe(
    "/admin/operations/catalogue/imports/test-run",
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("shows errors without starting a paid run", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) =>
      options
        ? Response.json(
            { error: "Refresh model pricing first." },
            { status: 400 },
          )
        : Response.json({ runs: [] }),
    ),
  );
  render(
    <TooltipProvider>
      <CourseImportWorkspace year={2026} />
    </TooltipProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Refresh model pricing first.",
  );
  expect(
    screen.getByRole("button", { name: /Import \d+ courses/ }),
  ).toBeDisabled();
});

it("creates an AI-free import without a spending limit", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (!options) return Response.json({ runs: [] });
      const body = JSON.parse(options.body as string);
      requests.push(body);
      return Response.json(
        body.action === "preview"
          ? {
              count: 10,
              availableCount: 10,
              minimumUsd: 0,
              estimatedUsd: 0,
              maximumUsd: 0,
              estimateKind: "not_used",
              estimateBasis: "AI is disabled.",
              budgetUsd: 0,
            }
          : { runId: "deterministic-run" },
      );
    }),
  );
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CourseImportWorkspace year={2026} />
    </TooltipProvider>,
  );
  await screen.findByRole("button", { name: "Import 10 courses" });
  await user.click(
    screen.getByRole("checkbox", {
      name: "Use AI for ambiguous requirements",
    }),
  );
  await screen.findByText("AI is disabled. This import has no AI spend.");
  await user.click(screen.getByRole("button", { name: "Import 10 courses" }));
  await waitFor(() =>
    expect(requests).toContainEqual({
      action: "create",
      year: 2026,
      kind: "course",
      limit: 10,
      budgetUsd: 0,
      allowAi: false,
      publishVerified: false,
    }),
  );
});

it("retries a failed estimate and enables Start after recovery", async () => {
  let attempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (!options) return Response.json({ runs: [] });
      attempts++;
      return attempts === 1
        ? Response.json(
            { error: "Current model prices could not be loaded." },
            { status: 400 },
          )
        : Response.json({
            count: 10,
            availableCount: 10,
            minimumUsd: 0,
            estimatedUsd: 0.015,
            estimateKind: "provisional",
            estimateBasis: "One sample.",
            model: "test",
            maximumUsd: 0.07,
            budgetUsd: 0.5,
          });
    }),
  );
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CourseImportWorkspace year={2026} />
    </TooltipProvider>,
  );
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "Import 10 courses" });
  expect(
    screen.getByRole("button", { name: /Import \d+ courses/ }),
  ).toBeEnabled();
  expect(attempts).toBe(2);
});

it("opens a paused import on the progress screen with exact live costs", async () => {
  const paused = {
    publish_verified: false,
    publication_blockers: [
      { reason: "A printed class date needs review.", courses: 2 },
    ],
    id: "paused",
    created_at: "2026-10-03T02:00:00Z",
    state: "paused",
    pause_reason: "Budget reached.",
    total: 100,
    finished: 62,
    review: 12,
    failed: 3,
    imported: 59,
    published: 41,
    spent_usd: "0.31",
    reserved_usd: "0.04",
    budget_usd: "0.5",
  };
  const previous = Array.from({ length: 3 }, (_, index) => ({
    ...paused,
    id: `done-${index}`,
    state: "active",
    pause_reason: null,
    finished: 100,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) =>
      Response.json(
        options
          ? {
              count: 100,
              availableCount: 1000,
              minimumUsd: 0,
              estimatedUsd: 0.149325,
              estimateKind: "provisional",
              estimateBasis: "One sample.",
              maximumUsd: 0.725,
              budgetUsd: 0.5,
              model: "test",
            }
          : url.includes("runId=")
            ? { items: [], total: 0, page: 1, pageSize: 50 }
            : { runs: [paused, ...previous] },
      ),
    ),
  );
  render(
    <TooltipProvider>
      <CourseImportWorkspace
        year={2026}
        initialRun={{ ...paused, paid_courses: 1, free_courses: 1 }}
      />
    </TooltipProvider>,
  );
  await screen.findByText("Paused");
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  expect(
    screen.queryByText("A printed class date needs review."),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Spending limit")).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Import costs" }),
  ).toHaveTextContent("US$0.3100");
  expect(screen.getByText("US$0.0400")).toBeInTheDocument();
  expect(screen.getByText("US$0.1500")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Previous imports/ }),
  ).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Review (12)" }));
  await user.click(screen.getByRole("button", { name: "Grouped issues" }));
  expect(
    screen.getByRole("table", { name: "Publication review issues" }),
  ).toHaveTextContent("A printed class date needs review.");
  await user.click(
    screen.getByRole("button", {
      name: "View 2 records: A printed class date needs review.",
    }),
  );
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "outcome=review&issue=A%20printed%20class%20date",
      ),
    ),
  );
});

it("keeps costs mounted when no missing courses are found", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) =>
      Response.json(
        options
          ? {
              count: 0,
              availableCount: 0,
              minimumUsd: 0,
              estimatedUsd: 0,
              estimateKind: "provisional",
              estimateBasis: "One sample.",
              maximumUsd: 0,
              budgetUsd: 0.5,
              model: "test",
            }
          : { runs: [] },
      ),
    ),
  );
  render(
    <TooltipProvider>
      <CourseImportWorkspace year={2026} />
    </TooltipProvider>,
  );
  await screen.findByText(/No missing courses/);
  expect(screen.getByRole("slider")).toBeDisabled();
  expect(
    screen.getByRole("region", { name: "Import costs" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Nothing to import" }),
  ).toBeDisabled();
});

it("selects beyond 100 without refetching or remounting the cost panel", async () => {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) =>
    Response.json(
      options
        ? {
            count: 100,
            availableCount: 1000,
            minimumUsd: 0,
            estimatedUsd: 0.149325,
            maximumUsd: 0.725,
            estimateKind: "provisional",
            estimateBasis: "One sample.",
            budgetUsd: 0.5,
            model: "test",
          }
        : { runs: [] },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CourseImportWorkspace year={2026} />
    </TooltipProvider>,
  );
  await screen.findByText("100 of 1000 missing");
  const panel = screen.getByRole("region", { name: "Import costs" });
  const requests = fetch.mock.calls.filter((call) => call[1]).length;
  await user.click(screen.getByRole("button", { name: /^All$/ }));
  expect(
    screen.getByRole("button", { name: "Import 1000 courses" }),
  ).toBeEnabled();
  expect(screen.getByRole("slider")).toHaveValue("1000");
  expect(screen.getByRole("region", { name: "Import costs" })).toBe(panel);
  await user.clear(screen.getByLabelText("Spending limit"));
  await user.type(screen.getByLabelText("Spending limit"), "2");
  expect(screen.getByRole("region", { name: "Import costs" })).toBe(panel);
  expect(fetch.mock.calls.filter((call) => call[1])).toHaveLength(requests);
});

it("switches to progress when starting and updates actual costs while importing", async () => {
  let created = false;
  let polls = 0;
  const run = {
    id: "test-run",
    created_at: "2026-10-03T02:00:00Z",
    state: "active",
    pause_reason: null,
    total: 100,
    finished: 13,
    review: 13,
    failed: 0,
    imported: 13,
    published: 0,
    spent_usd: "0.018",
    reserved_usd: "0.00725",
    budget_usd: "0.5",
    paid_courses: 12,
    free_courses: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (!options) {
        if (!created) return Response.json({ runs: [] });
        polls++;
        return Response.json({
          runs: [
            {
              ...run,
              ...(polls > 1
                ? {
                    finished: 15,
                    imported: 15,
                    review: 15,
                    spent_usd: "0.024",
                    paid_courses: 14,
                  }
                : {}),
            },
          ],
        });
      }
      const body = JSON.parse(options.body as string);
      if (body.action === "create") {
        await new Promise((resolve) => setTimeout(resolve, 50));
        created = true;
        return Response.json({ runId: "test-run" });
      }
      if (body.action === "advance") return Response.json({ dispatched: true });
      return Response.json({
        count: 100,
        availableCount: 1000,
        minimumUsd: 0,
        estimatedUsd: 0.15,
        maximumUsd: 0.725,
        estimateKind: "provisional",
        estimateBasis: "One sample.",
        budgetUsd: 0.5,
        model: "test",
      });
    }),
  );
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CourseImportWorkspace year={2026} />
    </TooltipProvider>,
  );
  await screen.findByText("100 of 1000 missing");
  await user.click(screen.getByRole("button", { name: "Import 100 courses" }));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Spending limit")).not.toBeInTheDocument();
  await screen.findByText("US$0.0180");
  expect(screen.getByText("US$0.0073")).toBeInTheDocument();
  expect(
    screen.getByText(/12 records with AI charges · 1 with no AI charge/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Importing..." }),
  ).not.toBeInTheDocument();
  await waitFor(
    () => expect(screen.getByText("US$0.0240")).toBeInTheDocument(),
    { timeout: 2500 },
  );
  expect(screen.getByText("15 of 100 imported")).toBeInTheDocument();
  expect(
    screen.getByText(/14 records with AI charges · 1 with no AI charge/),
  ).toBeInTheDocument();
});

it("keeps the summary on Overview and paginates linked course results", async () => {
  const completed = {
    id: "completed",
    created_at: "2026-10-03T02:00:00Z",
    state: "active",
    pause_reason: null,
    total: 2,
    finished: 2,
    imported: 2,
    published: 1,
    drafts: 1,
    review: 0,
    failed: 0,
    spent_usd: "0.0012",
    reserved_usd: "0",
    budget_usd: "0.5",
    publish_verified: false,
    publication_blockers: [],
    paid_courses: 1,
    free_courses: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("runId=")
          ? {
              total: 50,
              page: Number(
                new URL(url, "http://localhost").searchParams.get("page"),
              ),
              pageSize: 25,
              items: [
                {
                  recordId: 1,
                  code: "COMP1100",
                  title: "Programming",
                  status: "applied",
                  published: true,
                  hasDraft: false,
                  issues: [],
                  error: null,
                  actualUsd: 0.0012,
                },
                {
                  recordId: 2,
                  code: "COMP1110",
                  title: "Software",
                  status: "review_required",
                  published: false,
                  hasDraft: true,
                  issues: [],
                  error: null,
                  actualUsd: 0,
                },
              ],
            }
          : { runs: [completed] },
      ),
    ),
  );
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CourseImportWorkspace year={2026} initialRun={completed} />
    </TooltipProvider>,
  );
  await screen.findByText("Finished");
  expect(screen.getByText("2 of 2 imported")).toBeVisible();
  expect(screen.queryByText(/validation issues/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Set aside/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Courses (2)" }));
  const link = await screen.findByRole("link", {
    name: "Programming",
  });
  expect(link).toHaveAttribute("href", "/admin/courses/2026/comp1100");
  expect(window.location.search).toBe("?tab=courses");
  await user.click(screen.getByRole("tab", { name: "Overview" }));
  // The list remains available even while the next background refresh is pending.
  const originalFetch = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  await user.click(screen.getByRole("tab", { name: "Courses (2)" }));
  expect(screen.getByRole("link", { name: "Programming" })).toBeVisible();
  vi.stubGlobal("fetch", originalFetch);
  expect(screen.getByText("Draft ready")).toBeVisible();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(
    screen.getByRole("navigation", { name: "courses pagination" }),
  ).toBeVisible();
  expect(screen.getByRole("table", { name: "Imported courses" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("page=2&")),
  );
  await user.type(
    screen.getByPlaceholderText("Search courses by code or title"),
    "COMP1100",
  );
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("page=1&q=COMP1100"),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Outcome" }));
  await user.click(screen.getByRole("button", { name: "Needs review" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("outcome=review"),
    ),
  );
  expect(
    screen.queryByRole("link", { name: "All imports" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "New import" }),
  ).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.every((call) => call.length === 1)).toBe(
    true,
  );
  await user.click(screen.getByRole("tab", { name: "Courses (2)" }));
  await user.keyboard("{ArrowLeft}");
  expect(window.location.search).toBe("?tab=overview");
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

it("enables future auto-publication separately from publishing saved verified drafts", async () => {
  const run = {
    id: "saved",
    created_at: "2026-10-03T02:00:00Z",
    state: "active",
    pause_reason: null,
    total: 10,
    finished: 4,
    imported: 4,
    published: 0,
    drafts: 3,
    review: 1,
    failed: 0,
    spent_usd: "0.0012",
    reserved_usd: "0",
    budget_usd: "0.5",
    publish_verified: false,
    publication_blockers: [],
    paid_courses: 1,
    free_courses: 3,
  };
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (!options)
        return Response.json(
          url.includes("runId=")
            ? { items: [], page: 1, pageSize: 25, total: 0 }
            : { runs: [run] },
        );
      const body = JSON.parse(options.body as string);
      requests.push(body);
      if (body.action === "auto-publish") {
        run.publish_verified = body.enabled;
        return Response.json({ enabled: body.enabled });
      }
      return Response.json(
        body.afterRecordId === 0
          ? { published: 2, held: 1, hasMore: true, afterRecordId: 10 }
          : { published: 1, held: 0, hasMore: false, afterRecordId: 11 },
      );
    }),
  );
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CourseImportWorkspace
        year={2026}
        initialRun={run}
        canPublish
        canChangeAutoPublish
      />
    </TooltipProvider>,
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Auto-publish remaining courses" }),
  );
  await waitFor(() =>
    expect(requests).toEqual([
      { action: "auto-publish", runId: "saved", enabled: true },
    ]),
  );
  await user.click(
    screen.getByRole("button", { name: "Publish verified drafts" }),
  );
  await screen.findByText("3 published · 1 kept as drafts");
  expect(requests.slice(1)).toEqual([
    { action: "publish-drafts", runId: "saved", afterRecordId: 0 },
    { action: "publish-drafts", runId: "saved", afterRecordId: 10 },
  ]);
});

it("shows imported courses rather than counting stopped jobs as imports", () => {
  const run = {
    id: "stopped",
    created_at: "2026-10-03",
    state: "cancelled",
    pause_reason: null,
    total: 100,
    finished: 100,
    imported: 6,
    published: 0,
    drafts: 5,
    review: 1,
    failed: 0,
    stopped: 94,
    spent_usd: "0.0014",
    reserved_usd: "0",
    budget_usd: "0.5",
    publish_verified: false,
    publication_blockers: [],
    paid_courses: 1,
    free_courses: 5,
  };
  render(<CourseRunHeader run={run} active={false} />);
  expect(screen.getByText("6 of 100 imported")).toBeVisible();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "6");
  expect(screen.getByText("94 stopped")).toBeVisible();
  expect(screen.queryByText(/100 of 100/)).not.toBeInTheDocument();
});

it("previews the selected structure kind and uses its available count", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (!options) return Response.json({ runs: [] });
      const body = JSON.parse(options.body as string);
      requests.push(body);
      return Response.json({
        count: 8,
        availableCount: 8,
        minimumUsd: 0,
        maximumUsd: 0.128,
        estimatedUsd: null,
        estimateKind: "unavailable",
        estimateBasis: "No measured estimate yet.",
        budgetUsd: 0.5,
      });
    }),
  );
  render(
    <TooltipProvider>
      <CourseImportWorkspace year={2026} kind="specialisation" />
    </TooltipProvider>,
  );
  await waitFor(() =>
    expect(requests).toContainEqual({
      action: "preview",
      year: 2026,
      kind: "specialisation",
      allowAi: true,
    }),
  );
  expect(
    screen.getByRole("slider", { name: "Specialisations to import" }),
  ).toHaveAttribute("max", "8");
  expect(
    screen.getByRole("button", { name: "Import 8 specialisations" }),
  ).toBeEnabled();
});
