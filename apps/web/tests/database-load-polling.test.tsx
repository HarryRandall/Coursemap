import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { CatalogueSyncButton } from "@/ui/admin/catalogue/sync-button";
import { CourseImportWorkspace } from "@/ui/admin/catalogue/course-import-workspace";
import type { CatalogueSync } from "@/lib/coursemap/admin-catalogue-record";
import type { CourseRunProgress } from "@/lib/catalogue-runs/progress";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/admin/operations/catalogue/imports/run",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/ui/shell", () => ({
  AppShell: ({
    children,
    tabs,
  }: {
    children: React.ReactNode;
    tabs?: React.ReactNode;
  }) => (
    <>
      {tabs}
      {children}
    </>
  ),
}));
vi.mock("@/ui/common/task-toast", () => ({ startTask: vi.fn() }));
const sync: CatalogueSync = {
  id: "10000000-0000-4000-8000-000000000001",
  status: "queued",
  trigger: "manual",
  requestedAt: "2026-10-10T00:00:00Z",
  checkedAt: null,
  completedAt: null,
  previousSourceVersionId: null,
  sourceVersionId: null,
  errorCode: null,
  errorMessage: null,
};
const run: CourseRunProgress = {
  id: "run",
  created_at: "2026-10-10T00:00:00Z",
  state: "active",
  pause_reason: null,
  total: 10,
  finished: 0,
  review: 0,
  imported: 0,
  published: 0,
  failed: 0,
  spent_usd: "0",
  reserved_usd: "0",
  budget_usd: "1",
  publish_verified: false,
  publication_blockers: [],
  paid_courses: 0,
  free_courses: 0,
};
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function visibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  fireEvent(document, new Event("visibilitychange"));
}
function syncButton() {
  return render(
    <CatalogueSyncButton
      recordId={42}
      code="COMP1100"
      kind="course"
      latestSync={sync}
      hasSynced
    />,
  );
}
function workspace(tab = "overview", initialRun = run) {
  return render(
    <TooltipProvider>
      <CourseImportWorkspace
        year={2026}
        initialRun={initialRun}
        initialTab={tab}
      />
    </TooltipProvider>,
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  visibility("visible");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  visibility("visible");
});

test("unchanged syncs use bounded status reads with backoff, and refresh once per changed status", async () => {
  let status = "queued";
  const fetch = vi.fn<(url: string) => Promise<Response>>(async () =>
    Response.json({ sync: { id: sync.id, status, errorMessage: null } }),
  );
  vi.stubGlobal("fetch", fetch);
  syncButton();
  await tick(2000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[0]).toBe(
    `/api/admin/catalogue-syncs?syncId=${sync.id}`,
  );
  expect(refresh).not.toHaveBeenCalled();
  await tick(3999);
  expect(fetch).toHaveBeenCalledTimes(1);
  status = "running";
  await tick(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  status = "applied";
  await tick(2000);
  expect(refresh).toHaveBeenCalledTimes(2);
  await tick(60000);
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("sync polling pauses in hidden tabs and stops at its ceiling with a manual check", async () => {
  const fetch = vi.fn<(url: string) => Promise<Response>>(async () =>
    Response.json({
      sync: { id: sync.id, status: "queued", errorMessage: null },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  syncButton();
  visibility("hidden");
  await tick(60000);
  expect(fetch).not.toHaveBeenCalled();
  visibility("visible");
  await tick(2000);
  expect(fetch).toHaveBeenCalledTimes(1);
  await tick(600000);
  const count = fetch.mock.calls.length;
  expect(count).toBeLessThan(30);
  expect(
    screen.getByText("Still running. Refresh to check."),
  ).toBeInTheDocument();
  await tick(60000);
  expect(fetch).toHaveBeenCalledTimes(count);
  fireEvent.click(screen.getByRole("button", { name: "Refresh to check" }));
  expect(refresh).toHaveBeenCalledTimes(1);
});

test("import summaries back off without progress, pause when hidden and stop on completion", async () => {
  let summary = run;
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.includes("summary=")
        ? { runs: [summary] }
        : { items: [], total: 0, page: 1, pageSize: 24 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  workspace();
  await tick(0);
  const summaries = () =>
    fetch.mock.calls.filter(([url]) => url.includes("summary="));
  expect(summaries()).toHaveLength(1);
  await tick(2000);
  expect(summaries()).toHaveLength(2);
  await tick(3999);
  expect(summaries()).toHaveLength(2);
  visibility("hidden");
  await tick(60000);
  expect(summaries()).toHaveLength(2);
  summary = { ...run, finished: 10 };
  visibility("visible");
  await tick(4000);
  expect(summaries()).toHaveLength(3);
  expect(refresh).toHaveBeenCalledTimes(1);
  await tick(60000);
  expect(summaries()).toHaveLength(3);
});

test("completed import results load once and do not poll forever", async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.includes("summary=")
        ? { runs: [{ ...run, finished: 10 }] }
        : { items: [], total: 0, page: 1, pageSize: 24 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  workspace("courses", { ...run, finished: 10 });
  await tick(0);
  const count = fetch.mock.calls.length;
  await tick(60000);
  expect(fetch).toHaveBeenCalledTimes(count);
});

test("a pending status read never overlaps another and is discarded after unmount", async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn<(url: string) => Promise<Response>>(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const view = syncButton();
  await tick(2000);
  await tick(60000);
  expect(fetch).toHaveBeenCalledTimes(1);
  view.unmount();
  await act(async () =>
    resolve(
      Response.json({
        sync: { id: sync.id, status: "applied", errorMessage: null },
      }),
    ),
  );
  expect(refresh).not.toHaveBeenCalled();
});

test("an unchanged import reaches the ceiling and offers a manual status check", async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.includes("summary=")
        ? { runs: [run] }
        : { items: [], total: 0, page: 1, pageSize: 24 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  workspace();
  await tick(600000);
  expect(
    screen.getByRole("button", { name: "Refresh to check" }),
  ).toBeInTheDocument();
  const count = fetch.mock.calls.length;
  await tick(60000);
  expect(fetch).toHaveBeenCalledTimes(count);
});

test("active import advancement stays serial and pauses when hidden", async () => {
  let release!: () => void;
  let advances = 0;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      if (body.action === "advance") {
        advances++;
        if (advances === 1)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
      }
      return Response.json({ dispatched: true });
    }
    return Response.json(
      url.includes("summary=")
        ? { runs: [run] }
        : { items: [], total: 0, page: 1, pageSize: 24 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  workspace();
  await tick(0);
  fireEvent.click(screen.getByRole("button", { name: "Continue import" }));
  await tick(0);
  expect(advances).toBe(1);
  await tick(60000);
  expect(advances).toBe(1);
  visibility("hidden");
  await act(async () => release());
  await tick(30000);
  expect(advances).toBe(1);
  visibility("visible");
  await tick(30000);
  expect(advances).toBeGreaterThan(1);
});

test("a hung status request still reaches the polling ceiling", async () => {
  const fetch = vi.fn<(url: string) => Promise<Response>>(
    () => new Promise<Response>(() => {}),
  );
  vi.stubGlobal("fetch", fetch);
  syncButton();
  await tick(600000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Refresh to check" }),
  ).toBeInTheDocument();
});

test("a paused import refreshes the page once and stops watching", async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.includes("summary=")
        ? { runs: [{ ...run, state: "paused" }] }
        : { items: [], total: 0, page: 1, pageSize: 24 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  workspace();
  await tick(0);
  expect(refresh).toHaveBeenCalledTimes(1);
  const count = fetch.mock.calls.length;
  await tick(60000);
  expect(fetch).toHaveBeenCalledTimes(count);
});

test("summary and result polling stop when the selected import finishes", async () => {
  let summary = run;
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.includes("summary=")
        ? { runs: [summary] }
        : { items: [], total: 0, page: 1, pageSize: 24 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  workspace("courses");
  await tick(0);
  summary = { ...run, finished: run.total };
  await tick(10000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("tab", { name: /Courses/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const calls = fetch.mock.calls.length;
  await tick(60000);
  visibility("hidden");
  await tick(60000);
  visibility("visible");
  await tick(60000);
  expect(fetch).toHaveBeenCalledTimes(calls);
  expect(refresh).toHaveBeenCalledTimes(1);
});

test.each([
  { state: "active", finished: run.total },
  { state: "paused", finished: 0 },
  { state: "cancelled", finished: 0 },
])(
  "terminal imports do not retry failed reads automatically ($state, $finished)",
  async (terminal) => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: "Import progress could not be loaded." },
        { status: 500 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    workspace("courses", { ...run, ...terminal });
    await tick(0);
    expect(
      screen.getByText("Import progress could not be loaded."),
    ).toBeInTheDocument();
    const calls = fetch.mock.calls.length;
    await tick(60000);
    expect(fetch).toHaveBeenCalledTimes(calls);
  },
);
