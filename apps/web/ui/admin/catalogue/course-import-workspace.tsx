"use client";

import {
  importKindLabel,
  type BulkImportKind,
} from "@/lib/catalogue-runs/kinds";
import { YearPicker } from "@/ui/common/year-picker";
import { adminCourseImportPath } from "@/lib/coursemap/catalogue-kinds";
import { useRouter } from "next/navigation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { AppShell } from "@/ui/shell";
import { CourseImportSetup } from "./course-import-setup";
import { ImportKindPicker } from "./import-kind-picker";
import { CourseRunReview } from "./course-run-review";
import { CourseRunResults } from "./course-run-results";
import { useEffect, useRef, useState } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import { Checkbox } from "@coursemap/ui/primitives/checkbox";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { TriangleAlert } from "lucide-react";
import { useCataloguePoll } from "./use-catalogue-poll";
import { SyncPollNotice } from "./sync-poll-notice";

import { CourseRunHeader, CourseRunProgress } from "./course-run-progress";
import {
  type CourseRunResults as Results,
  type CourseRunProgress as Run,
} from "../../../lib/catalogue-runs/progress";

type Preview = {
  count: number;
  availableCount: number;
  model: string;
  minimumUsd: number;
  estimatedUsd: number | null;
  maximumUsd: number;
  estimateKind: "measured" | "provisional" | "unavailable" | "not_used";
  estimateBasis: string;
  budgetUsd: number;
};

function importTab(value: string | null) {
  return value === "courses" || value === "review" ? value : "overview";
}

async function action(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/course-import-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The import action failed.");
  return data;
}

export function CourseImportWorkspace({
  year,
  kind = "course",
  initialRun = null,
  initialTab = "overview",
  years = [year],
  canPublish = false,
  canChangeAutoPublish = false,
}: {
  year: number;
  kind?: BulkImportKind;
  years?: number[];
  initialRun?: Run | null;
  initialTab?: string;
  canPublish?: boolean;
  canChangeAutoPublish?: boolean;
}) {
  const router = useRouter();
  const plural = importKindLabel(kind);
  const label = plural.charAt(0).toUpperCase() + plural.slice(1);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationMessage, setPublicationMessage] = useState<string | null>(
    null,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [resultTab, setResultTab] = useState(importTab(initialTab));
  const [resultQuery, setResultQuery] = useState("");
  const [resultOutcome, setResultOutcome] = useState("");
  const [resultIssue, setResultIssue] = useState("");
  const [resultPage, setResultPage] = useState(1);
  const [resultCache, setResultCache] = useState<Record<string, Results>>({});
  function changeTab(tab: string) {
    setResultTab(importTab(tab));
    setResultPage(1);
    setResultIssue("");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", importTab(tab));
    window.history.pushState(null, "", url);
  }
  useEffect(() => {
    const restoreTab = () => {
      setResultTab(
        importTab(new URLSearchParams(window.location.search).get("tab")),
      );
      setResultPage(1);
      setResultIssue("");
    };
    window.addEventListener("popstate", restoreTab);
    return () => window.removeEventListener("popstate", restoreTab);
  }, []);
  const refreshedRun = useRef<string | null>(null);
  const lastRunState = useRef(
    initialRun ? { id: initialRun.id, state: initialRun.state } : null,
  );
  const [limit, setLimit] = useState(100);
  const [codeFilter, setCodeFilter] = useState("");
  const codes = codeFilter.trim()
    ? codeFilter
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
    : undefined;
  const [budget, setBudget] = useState(0.5);
  const [allowAi, setAllowAi] = useState(true);
  const [publishVerified, setPublishVerified] = useState(false);
  // False while a degree or major is still resolving to its course codes.
  // An empty code list means every missing record, so nothing may preview
  // or start until the chosen scope is known.
  const [scopeReady, setScopeReady] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [runs, setRuns] = useState<Run[]>(initialRun ? [initialRun] : []);
  const [viewRunId, setViewRunId] = useState<string | null>(
    initialRun?.id ?? null,
  );
  const [active, setActive] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimateAttempt, setEstimateAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const current = runs.find((run) => run.id === viewRunId);
  const terminalRun =
    current !== undefined &&
    (current.state !== "active" || current.finished >= current.total);
  const summaryWatchKey = viewRunId
    ? `${viewRunId}:${active}:${estimateAttempt}`
    : null;
  const summaryAttemptedKey = useRef<string | null>(null);
  const summaryFingerprint = useRef("");
  const summaryPollingStopped = useCataloguePoll({
    watchKey: summaryWatchKey,
    enabled: viewRunId !== null,
    initialDelayMs: 0,
    async poll(signal) {
      if (terminalRun && summaryAttemptedKey.current === summaryWatchKey)
        return { changed: false, done: true };
      summaryAttemptedKey.current = summaryWatchKey;
      const response = await fetch(
        `/api/admin/course-import-runs?year=${year}&summary=${viewRunId}`,
        { signal, cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Import progress could not be loaded.");
      if (signal.aborted) return { changed: false, done: true };
      if (!Array.isArray(data.runs))
        throw new Error("Import progress could not be loaded.");
      const fingerprint = JSON.stringify(data.runs);
      const changed = summaryFingerprint.current !== fingerprint;
      summaryFingerprint.current = fingerprint;
      setRuns(data.runs);
      const running = (data.runs as Run[]).find((run) => run.id === viewRunId);
      const done =
        !running ||
        running.state !== "active" ||
        running.finished >= running.total;
      if (!done && active && document.visibilityState === "visible") {
        await action({ action: "advance", runId: active });
      } else if (active && !signal.aborted) setActive(null);
      return { changed, done };
    },
    onError(cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Import progress could not be loaded.",
      );
      setActive(null);
    },
  });

  useEffect(() => {
    if (active || viewRunId || !scopeReady) return;
    let stopped = false;
    const timeout = setTimeout(async () => {
      setEstimating(true);
      setError(null);
      try {
        const result = await action({
          action: "preview",
          year,
          kind,
          allowAi,
          codes: codeFilter.trim()
            ? codeFilter
                .trim()
                .split(/[\s,]+/)
                .filter(Boolean)
            : undefined,
        });
        if (!stopped) {
          setPreview(result);
          setLimit((value) =>
            Math.min(Math.max(1, value), result.availableCount),
          );
        }
      } catch (cause) {
        if (!stopped)
          setError(
            cause instanceof Error
              ? cause.message
              : "The estimate could not be loaded. Try again.",
          );
      } finally {
        if (!stopped) setEstimating(false);
      }
    }, 250);
    return () => {
      stopped = true;
      clearTimeout(timeout);
    };
  }, [
    active,
    viewRunId,
    year,
    kind,
    allowAi,
    codeFilter,
    estimateAttempt,
    scopeReady,
  ]);

  async function startImport() {
    setPending(true);
    setError(null);
    try {
      const result = await action({
        action: "create",
        year,
        kind,
        limit,
        budgetUsd: allowAi ? budget : 0,
        allowAi,
        publishVerified,
        codes,
      });
      setViewRunId(result.runId);
      // Keep the live worker mounted while giving this saved run a reloadable URL.
      window.history.replaceState(
        null,
        "",
        adminCourseImportPath(result.runId, year, kind),
      );
      setResultPage(1);
      setResultCache({});
      setResultTab("overview");
      setActive(result.runId);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The import could not start.",
      );
    } finally {
      setPending(false);
    }
  }

  const progressScreen = viewRunId !== null;
  const unfinished =
    current &&
    current.finished < current.total &&
    current.state !== "cancelled";
  async function publishSavedDrafts() {
    if (!current || publicationBusy) return;
    setPublicationBusy(true);
    setPublicationMessage("Checking saved drafts...");
    setError(null);
    let afterRecordId = 0;
    let published = 0;
    let held = 0;
    try {
      do {
        const result = await action({
          action: "publish-drafts",
          runId: current.id,
          afterRecordId,
        });
        published += result.published;
        held += result.held;
        afterRecordId = result.afterRecordId;
        if (!mounted.current) return;
        setPublicationMessage(
          `${published} published · ${held} kept as drafts`,
        );
        if (!result.hasMore) break;
      } while (mounted.current);
      setEstimateAttempt((value) => value + 1);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Saved drafts could not be published.",
      );
    } finally {
      if (mounted.current) setPublicationBusy(false);
    }
  }

  async function changeAutoPublish(enabled: boolean) {
    if (!current || publicationBusy) return;
    setPublicationBusy(true);
    setError(null);
    try {
      await action({ action: "auto-publish", runId: current.id, enabled });
      setRuns((items) =>
        items.map((run) =>
          run.id === current.id ? { ...run, publish_verified: enabled } : run,
        ),
      );
      setPublicationMessage(
        enabled
          ? `Auto-publish enabled for remaining ${plural}. Publish verified drafts below to include saved results.`
          : `Auto-publish disabled for remaining ${plural}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Auto-publish could not be updated.",
      );
    } finally {
      setPublicationBusy(false);
    }
  }

  const resultsUrl = (page: number, outcome: string, query = "", issue = "") =>
    `/api/admin/course-import-runs?year=${year}&runId=${viewRunId}&page=${page}&q=${encodeURIComponent(query)}&outcome=${outcome}&issue=${encodeURIComponent(issue)}`;
  const resultUrl = resultsUrl(
    resultPage,
    resultTab === "review" ? "review" : resultOutcome,
    resultQuery,
    resultIssue,
  );
  const resultKey = `${estimateAttempt}:${resultUrl}`;
  const results = resultCache[resultKey] ?? null;
  const resultsLoading = results === null;
  const allResultsUrl = resultsUrl(1, "");
  const reviewResultsUrl = resultsUrl(1, "review");

  // Warm both lists while the overview is open so tab changes need no round trip.
  useEffect(() => {
    if (!viewRunId || document.visibilityState !== "visible") return;
    let stopped = false;
    void Promise.all(
      [allResultsUrl, reviewResultsUrl].map(async (url) => {
        try {
          const response = await fetch(url);
          if (!response.ok) return;
          const data = await response.json();
          if (!stopped)
            setResultCache((cache) => ({
              ...cache,
              [`${estimateAttempt}:${url}`]: data,
            }));
        } catch {
          /* The active list reports fetch failures and retries. */
        }
      }),
    );
    return () => {
      stopped = true;
    };
  }, [viewRunId, allResultsUrl, reviewResultsUrl, estimateAttempt]);

  const resultAttemptedKey = useRef<string | null>(null);
  const resultFingerprint = useRef("");
  const resultPollingStopped = useCataloguePoll({
    watchKey: resultTab !== "overview" && viewRunId ? resultKey : null,
    enabled: viewRunId !== null && resultTab !== "overview",
    initialDelayMs: resultQuery ? 200 : 0,
    async poll(signal) {
      // A results check can remain scheduled when the last summary finishes.
      if (terminalRun && resultAttemptedKey.current === resultKey)
        return { changed: false, done: true };
      resultAttemptedKey.current = resultKey;
      const response = await fetch(resultUrl, { signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Course results could not be loaded.");
      if (signal.aborted) return { changed: false, done: true };
      const fingerprint = JSON.stringify(data);
      const changed = resultFingerprint.current !== fingerprint;
      resultFingerprint.current = fingerprint;
      setResultCache((cache) => ({ ...cache, [resultKey]: data }));
      if (data.page !== resultPage) setResultPage(data.page);
      return {
        changed,
        done:
          !current ||
          current.state !== "active" ||
          current.finished >= current.total,
      };
    },
    onError(cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Course results could not be loaded.",
      );
    },
  });

  useEffect(() => {
    if (current) {
      if (
        lastRunState.current?.id === current.id &&
        lastRunState.current.state !== current.state &&
        current.finished < current.total
      )
        router.refresh();
      lastRunState.current = { id: current.id, state: current.state };
    }
    if (
      current &&
      current.finished === current.total &&
      refreshedRun.current !== current.id
    ) {
      refreshedRun.current = current.id;
      router.refresh();
    }
  }, [current, router]);

  const available = preview?.availableCount ?? 0;
  const selected = Math.min(Math.max(0, limit), available);
  const scale = selected / Math.max(1, preview?.count ?? 1);
  const maximum = preview ? preview.maximumUsd * scale : null;
  const estimated =
    preview?.estimatedUsd == null ? null : preview.estimatedUsd * scale;
  const overBudget = maximum !== null && maximum > budget;
  const valid =
    Number.isInteger(limit) &&
    selected > 0 &&
    limit === selected &&
    budget >= (allowAi ? 0.01 : 0) &&
    budget <= 10;
  const presets = [10, 25, 50, 100]
    .map((percent) => ({
      label: percent === 100 ? "All" : `${percent}%`,
      value: Math.max(1, Math.ceil((available * percent) / 100)),
    }))
    .filter(
      (preset, index, items) =>
        items.findIndex((item) => item.value === preset.value) === index,
    );

  const courseResults = (
    <CourseRunResults
      kind={kind}
      results={results}
      query={resultQuery}
      outcome={resultTab === "review" ? "review" : resultOutcome}
      reviewOnly={resultTab === "review"}
      issue={resultIssue}
      onQueryChange={(value) => {
        setResultQuery(value);
        setResultPage(1);
      }}
      onFilterChange={(key, value) => {
        if (key === "outcome") setResultOutcome(value);
        if (key === "issue") setResultIssue(value);
        setResultPage(1);
      }}
      year={year}
      page={resultPage}
      onPageChange={(page) => {
        setResultPage(page);
      }}
      loading={resultsLoading}
    />
  );

  return (
    <Tabs value={resultTab} onValueChange={changeTab} className="block">
      <AppShell
        admin
        fill
        breadcrumbSegmentLabels={{ operations: null, imports: "Bulk imports" }}
        currentBreadcrumbLabel={
          progressScreen ? `${year} import` : "New import"
        }
        tabs={
          progressScreen ? (
            <TabsList aria-label="Import details" variant="line">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="courses">
                {label}
                {current ? ` (${current.total})` : ""}
              </TabsTrigger>
              <TabsTrigger value="review">
                Review{current ? ` (${current.review})` : ""}
              </TabsTrigger>
            </TabsList>
          ) : undefined
        }
      >
        <div className="workspace-stack">
          <header
            className={progressScreen ? "sr-only" : "shrink-0 space-y-4 pb-4"}
          >
            <div
              className={
                progressScreen
                  ? "sr-only"
                  : "flex flex-wrap items-center justify-between gap-3"
              }
            >
              <h1
                className={progressScreen ? "sr-only" : "text-xl font-semibold"}
              >
                {progressScreen
                  ? `${year} import progress`
                  : `Import ${year} ${plural}`}
              </h1>
              {!progressScreen && (
                <div className="flex items-center gap-2">
                  <ImportKindPicker
                    value={kind}
                    onChange={(value) =>
                      router.push(adminCourseImportPath("new", year, value))
                    }
                  />
                  <YearPicker
                    value={year}
                    years={years}
                    onChange={(next) => {
                      if (typeof next === "number")
                        router.push(adminCourseImportPath("new", next, kind));
                    }}
                  />
                </div>
              )}
            </div>
          </header>
          <div
            className={
              progressScreen ? "workspace-stack pb-6" : "space-y-5 pb-6"
            }
          >
            {progressScreen ? (
              <>
                <TabsContent value="courses" className="workspace-stack">
                  {courseResults}
                </TabsContent>
                <TabsContent value="review" className="workspace-stack">
                  <CourseRunReview
                    run={current}
                    onViewCourses={(issue = "") => {
                      changeTab("review");
                      setResultOutcome("review");
                      setResultIssue(issue);
                      setResultQuery("");
                      setResultPage(1);
                    }}
                  >
                    {courseResults}
                  </CourseRunReview>
                </TabsContent>
                <TabsContent
                  value="overview"
                  className="workspace-scroll space-y-6"
                >
                  <CourseRunHeader
                    run={current}
                    active={active === viewRunId}
                  />
                  {current && (
                    <section
                      aria-label="Publication"
                      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                    >
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <Checkbox
                            checked={current.publish_verified}
                            disabled={
                              !canChangeAutoPublish ||
                              publicationBusy ||
                              !unfinished
                            }
                            onCheckedChange={(value) =>
                              void changeAutoPublish(value === true)
                            }
                          />
                          Auto-publish remaining {plural}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Only verified, untouched drafts are published. Records
                          needing review stay held.
                        </p>
                        {publicationMessage && (
                          <p role="status" className="text-sm">
                            {publicationMessage}
                          </p>
                        )}
                      </div>
                      {canPublish && (
                        <Button
                          variant="outline"
                          disabled={
                            publicationBusy ||
                            !(current.drafts || current.review)
                          }
                          onClick={() => void publishSavedDrafts()}
                        >
                          {publicationBusy
                            ? "Updating publication..."
                            : "Publish verified drafts"}
                        </Button>
                      )}
                    </section>
                  )}
                  <CourseRunProgress
                    run={current}
                    active={active === viewRunId}
                  />
                </TabsContent>
              </>
            ) : (
              <CourseImportSetup
                kind={kind}
                label={label}
                plural={plural}
                year={year}
                preview={preview}
                estimating={estimating}
                locked={pending || Boolean(active)}
                available={available}
                selected={selected}
                limit={limit}
                onLimitChange={setLimit}
                presets={presets}
                codeFilter={codeFilter}
                onCodeFilterChange={(value) => {
                  setCodeFilter(value);
                  setPreview(null);
                }}
                budget={budget}
                onBudgetChange={setBudget}
                allowAi={allowAi}
                onAllowAiChange={setAllowAi}
                publishVerified={publishVerified}
                onPublishVerifiedChange={setPublishVerified}
                estimated={estimated}
                maximum={maximum}
                overBudget={overBudget}
                onScopeReadyChange={(ready) => {
                  setScopeReady(ready);
                  if (!ready) setPreview(null);
                }}
                start={
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={
                      pending ||
                      estimating ||
                      !scopeReady ||
                      !preview ||
                      !valid ||
                      Boolean(error) ||
                      Boolean(active)
                    }
                    onClick={() => void startImport()}
                  >
                    {pending
                      ? "Starting..."
                      : active
                        ? "Importing..."
                        : available === 0 && preview
                          ? "Nothing to import"
                          : `Import ${selected || limit} ${
                              (selected || limit) === 1 ? kind : plural
                            }`}
                  </Button>
                }
              />
            )}
            {(summaryPollingStopped || resultPollingStopped) && (
              <SyncPollNotice
                onRefresh={() => {
                  router.refresh();
                  setEstimateAttempt((value) => value + 1);
                }}
              />
            )}
            {error && (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>
                  {progressScreen
                    ? "Could not update the import"
                    : "Could not prepare the import"}
                </AlertTitle>
                <AlertDescription>
                  {error}
                  {!active && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      disabled={pending || estimating}
                      onClick={() => {
                        setError(null);
                        setEstimateAttempt((value) => value + 1);
                      }}
                    >
                      Try again
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
          {progressScreen && unfinished && (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 py-4">
              {current.state === "active" && !active && (
                <Button onClick={() => setActive(current.id)}>
                  Continue import
                </Button>
              )}
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  void action({ action: "cancel", runId: current.id })
                    .then(() => {
                      setRuns((items) =>
                        items.map((run) =>
                          run.id === current.id
                            ? { ...run, state: "cancelled" }
                            : run,
                        ),
                      );
                      setActive(null);
                    })
                    .catch((cause: Error) => setError(cause.message));
                }}
              >
                Stop remaining
              </Button>
            </footer>
          )}
        </div>
      </AppShell>
    </Tabs>
  );
}
