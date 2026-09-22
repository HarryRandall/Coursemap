import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";

import type {
  DiscoveryCheckRow,
  SyncDetail,
  SyncOperationsPage,
} from "@/lib/coursemap/admin-operations";
import { DiscoveryList } from "@/ui/admin/operations/discovery-list";
import { SyncDetailView } from "@/ui/admin/operations/sync-detail";
import { SyncList } from "@/ui/admin/operations/sync-list";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/operations/catalogue",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/ui/admin/operations/artefact-viewer", () => ({
  ArtefactViewer: ({ artifacts }: { artifacts: unknown[] }) => (
    <div data-testid="artefacts">{artifacts.length}</div>
  ),
}));

function syncPage(
  overrides: Partial<SyncOperationsPage> = {},
): SyncOperationsPage {
  return {
    rows: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        code: "COMP2700",
        kind: "course",
        academicYear: 2027,
        status: "failed",
        trigger: "scheduled",
        requestedAt: "2026-09-21T10:00:00.000Z",
        startedAt: "2026-09-21T10:00:05.000Z",
        completedAt: "2026-09-21T10:00:35.000Z",
        durationMs: 30_000,
        attemptCount: 3,
        model: "openai/gpt-5",
        costUsd: 0.0042,
        errorCode: "OPENROUTER_HTTP_500",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
    query: "",
    status: "all",
    ...overrides,
  };
}

function syncDetail(overrides: Partial<SyncDetail> = {}): SyncDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    code: "COMP2700",
    kind: "course",
    academicYear: 2027,
    recordId: 12,
    status: "failed",
    trigger: "manual",
    requestedModel: "openai/gpt-5",
    parserVersion: "course-2",
    promptVersion: "course-7",
    schemaVersion: "course-3",
    requestedAt: "2026-09-21T10:00:00.000Z",
    startedAt: "2026-09-21T10:00:05.000Z",
    checkedAt: null,
    completedAt: "2026-09-21T10:00:35.000Z",
    attemptCount: 3,
    workerId: "99999999-9999-4999-8999-999999999999",
    leaseExpiresAt: "2026-09-21T10:05:00.000Z",
    queueMessageId: "msg-1",
    dispatchedAt: "2026-09-21T10:00:01.000Z",
    errorCode: "OPENROUTER_HTTP_500",
    errorMessage: "OpenRouter returned 500.",
    sourceVersionId: null,
    previousSourceVersionId: null,
    sourceDocument: {
      canonicalUrl: "https://programsandcourses.anu.edu.au/course/COMP2700",
      contentSha256: "a".repeat(64),
      httpStatus: 200,
      fetchedAt: "2026-09-21T10:00:06.000Z",
      byteSize: 2048,
      mediaType: "text/html",
    },
    stages: [
      {
        id: "stage-1",
        stageName: "source_fetch",
        attemptNumber: 1,
        status: "completed",
        startedAt: "2026-09-21T10:00:05.000Z",
        completedAt: "2026-09-21T10:00:06.000Z",
        durationMs: 1000,
        errorCode: null,
        errorSummary: null,
      },
      {
        id: "stage-2",
        stageName: "model_extract",
        attemptNumber: 3,
        status: "failed",
        startedAt: "2026-09-21T10:00:30.000Z",
        completedAt: "2026-09-21T10:00:35.000Z",
        durationMs: 5000,
        errorCode: "OPENROUTER_HTTP_500",
        errorSummary: "OpenRouter returned 500.",
      },
    ],
    artefacts: [
      {
        id: "artefact-1",
        kind: "raw_html",
        attemptNumber: 1,
        mediaType: "text/html",
        byteSize: 2048,
      },
    ],
    extractions: [
      {
        id: "extraction-1",
        extractionNumber: 1,
        requestedModel: "openai/gpt-5",
        resolvedModel: "openai/gpt-5-2026",
        reusedFromExtractionId: null,
        validationStatus: "invalid",
        schemaValid: false,
        domainValid: null,
        warningCount: 0,
        errorCount: 2,
        inputTokens: 1200,
        cachedInputTokens: 400,
        outputTokens: 300,
        reasoningTokens: 0,
        costUsd: 0.0042,
        costSource: "provider",
        latencyMs: 4200,
        finishReason: "stop",
        errorSummary: null,
      },
    ],
    changeCount: 0,
    ...overrides,
  };
}

function renderSyncList(page: SyncOperationsPage) {
  // FilterBar carries hints through the shared tooltip provider.
  return render(
    <TooltipProvider>
      <SyncList page={page} />
    </TooltipProvider>,
  );
}

test("the sync list carries the technical columns an operator needs", () => {
  renderSyncList(syncPage());
  const link = screen.getByRole("link", { name: "COMP2700" });
  expect(link.getAttribute("href")).toBe(
    "/admin/operations/catalogue/syncs/11111111-1111-4111-8111-111111111111",
  );
  expect(screen.getByText("failed")).toBeTruthy();
  expect(screen.getByText("scheduled")).toBeTruthy();
  expect(screen.getByText("3 attempts")).toBeTruthy();
  expect(screen.getByText("30.0 s")).toBeTruthy();
  expect(screen.getByText("US$0.0042")).toBeTruthy();
});

test("an empty list says what fills it rather than showing an empty table", () => {
  renderSyncList(syncPage({ rows: [], total: 0 }));
  expect(screen.getByText("No syncs yet")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
});

test("the sync detail shows the failure, the lease and the attempt that failed", () => {
  render(<SyncDetailView sync={syncDetail()} />);
  expect(screen.getByText("OPENROUTER_HTTP_500")).toBeTruthy();
  // The alert and the stage that failed both name it.
  expect(screen.getAllByText("OpenRouter returned 500.").length).toBe(2);
  expect(screen.getByText("99999999-9999-4999-8999-999999999999")).toBeTruthy();
  const stages = screen.getByText("Model extraction").closest("tr");
  expect(within(stages!).getByText("failed")).toBeTruthy();
  expect(within(stages!).getByText("3")).toBeTruthy();
  expect(screen.getByText("openai/gpt-5-2026")).toBeTruthy();
  expect(screen.getByText("2 errors")).toBeTruthy();
  expect(screen.getByTestId("artefacts").textContent).toBe("1");
});

test("the sync detail links back to the record it checked", () => {
  render(<SyncDetailView sync={syncDetail()} />);
  expect(
    screen.getByRole("link", { name: /Open the record/ }).getAttribute("href"),
  ).toBe("/admin/courses/2027/comp2700");
});

test("an incomplete listing check says so, because it cannot retire anything", () => {
  const checks: DiscoveryCheckRow[] = [
    {
      id: 7,
      kind: "course",
      academicYear: 2027,
      status: "completed",
      isComplete: false,
      discoveredCount: 120,
      startedAt: "2026-09-21T10:00:00.000Z",
      completedAt: "2026-09-21T10:00:20.000Z",
      durationMs: 20_000,
      errorCode: null,
      errorMessage: null,
    },
  ];
  render(<DiscoveryList checks={checks} />);
  expect(screen.getByText("Partial")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Courses" }).getAttribute("href"),
  ).toBe("/admin/operations/catalogue/discovery/7");
  expect(screen.getByText("120 discovered")).toBeTruthy();
});
