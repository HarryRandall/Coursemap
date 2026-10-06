"use client";

import {
  BULK_IMPORT_KINDS,
  importKindLabel,
  type BulkImportKind,
} from "@/lib/catalogue-runs/kinds";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@coursemap/ui/primitives/select";
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
import { CourseRunReview } from "./course-run-review";
import { CourseRunResults } from "./course-run-results";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import { Checkbox } from "@coursemap/ui/primitives/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@coursemap/ui/primitives/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import { Label } from "@coursemap/ui/primitives/label";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Info, TriangleAlert } from "lucide-react";

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
const budgetPrice = (value: number) => `US$${value.toFixed(2)}`;
const maximumPrice = (value: number) =>
  budgetPrice(Math.ceil(value * 100) / 100);

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
  const id = useId();
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

  useEffect(() => {
    if (!viewRunId) return;
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(
          `/api/admin/course-import-runs?year=${year}&summary=${viewRunId}`,
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (stopped) return;
        setRuns(data.runs);
        const running = (data.runs as Run[]).find((run) => run.id === active);
        if (running?.state === "active" && running.finished < running.total)
          await action({ action: "advance", runId: active });
        else if (active) setActive(null);
      } catch (cause) {
        if (!stopped) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Import progress could not be loaded.",
          );
          setActive(null);
        }
      }
      if (!stopped) timeout = setTimeout(poll, active ? 1000 : 3000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timeout);
    };
  }, [viewRunId, active, year, kind, estimateAttempt]);

  useEffect(() => {
    if (active || viewRunId) return;
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
  }, [active, viewRunId, year, kind, allowAi, codeFilter, estimateAttempt]);

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

  const current = runs.find((run) => run.id === viewRunId);
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
    if (!viewRunId) return;
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

  useEffect(() => {
    if (!viewRunId || resultTab === "overview") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(resultUrl);
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Course results could not be loaded.");
        if (!stopped) {
          setResultCache((cache) => ({ ...cache, [resultKey]: data }));
          if (data.page !== resultPage) setResultPage(data.page);
        }
      } catch (cause) {
        if (!stopped) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Course results could not be loaded.",
          );
        }
      }
      if (!stopped) timer = setTimeout(load, 3000);
    }
    timer = setTimeout(load, resultQuery ? 200 : 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [
    viewRunId,
    resultPage,
    year,
    resultQuery,
    resultOutcome,
    resultIssue,
    resultTab,
    estimateAttempt,
    resultUrl,
    resultKey,
  ]);

  useEffect(() => {
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
                  <Select
                    value={kind}
                    onValueChange={(value) =>
                      router.push(adminCourseImportPath("new", year, value))
                    }
                  >
                    <SelectTrigger aria-label="Import type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BULK_IMPORT_KINDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {importKindLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            {!progressScreen && (
              <p className="text-sm text-muted-foreground">
                Existing imports and drafts are skipped.
              </p>
            )}
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
              <>
                <div className="space-y-2">
                  <Label htmlFor={`${id}-codes`}>Only these codes</Label>
                  <Textarea
                    id={`${id}-codes`}
                    value={codeFilter}
                    disabled={pending}
                    aria-describedby={`${id}-codes-help`}
                    onChange={(event) => {
                      setCodeFilter(event.target.value);
                      setPreview(null);
                    }}
                  />
                  <p
                    id={`${id}-codes-help`}
                    className="text-xs text-muted-foreground"
                  >
                    Separate codes with commas or spaces. Leave blank to include
                    all missing records.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor={`${id}-slider`}>{label}</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {preview
                        ? `${selected} of ${available} missing`
                        : `Loading ${plural}...`}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      id={`${id}-slider`}
                      aria-label={`${label} to import`}
                      className="min-w-0 flex-1 cursor-pointer accent-primary"
                      type="range"
                      min={available ? 1 : 0}
                      max={Math.max(1, available)}
                      value={selected}
                      disabled={
                        !preview ||
                        available === 0 ||
                        pending ||
                        Boolean(active)
                      }
                      onChange={(event) => setLimit(Number(event.target.value))}
                    />
                    <InputGroup className="w-24 shrink-0">
                      <InputGroupInput
                        aria-label={`Exact ${kind} count`}
                        type="number"
                        min={available ? 1 : 0}
                        max={available || undefined}
                        value={limit}
                        disabled={
                          !preview ||
                          available === 0 ||
                          pending ||
                          Boolean(active)
                        }
                        onChange={(event) =>
                          setLimit(Number(event.target.value))
                        }
                      />
                    </InputGroup>
                  </div>
                  <div className="flex gap-2">
                    {presets.map((preset) => (
                      <Button
                        key={preset.label}
                        size="sm"
                        variant={
                          selected === preset.value ? "secondary" : "outline"
                        }
                        aria-pressed={selected === preset.value}
                        disabled={
                          !preview ||
                          available === 0 ||
                          pending ||
                          Boolean(active)
                        }
                        onClick={() => setLimit(preset.value)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${id}-budget`}>Spending limit</Label>
                    <InputGroup>
                      <InputGroupAddon>US$</InputGroupAddon>
                      <InputGroupInput
                        id={`${id}-budget`}
                        type="number"
                        min={allowAi ? 0.01 : 0}
                        max={10}
                        step={0.01}
                        value={allowAi ? budget : 0}
                        disabled={!allowAi || pending || Boolean(active)}
                        onChange={(event) =>
                          setBudget(Number(event.target.value))
                        }
                      />
                    </InputGroup>
                  </div>
                  <div className="space-y-1.5 sm:pt-7">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${id}-publish`}
                        disabled={pending || Boolean(active)}
                        checked={publishVerified}
                        onCheckedChange={(checked) =>
                          setPublishVerified(checked === true)
                        }
                      />
                      <Label htmlFor={`${id}-publish`}>
                        Auto-publish verified {plural}
                      </Label>
                    </div>
                    <p className="pl-6 text-xs text-muted-foreground">
                      Uncertain fields stay in drafts.
                    </p>
                  </div>
                </div>
                <section
                  aria-label="AI requirements interpretation"
                  className="rounded-lg border p-4"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      id={`${id}-ai`}
                      checked={allowAi}
                      disabled={pending || Boolean(active)}
                      onCheckedChange={(checked) =>
                        setAllowAi(checked === true)
                      }
                    />
                    <Label htmlFor={`${id}-ai`}>
                      Use AI for ambiguous requirements
                    </Label>
                  </div>
                  <p className="mt-2 pl-6 text-xs text-muted-foreground">
                    {allowAi
                      ? "Coursemap uses deterministic source data first, then asks AI only to interpret requirements it cannot safely parse."
                      : "AI is disabled. Coursemap imports deterministic source data only and keeps ambiguous requirements for review."}
                  </p>
                </section>
                <section
                  aria-label="Import costs"
                  aria-busy={estimating}
                  className="space-y-3 rounded-lg border bg-muted/30 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Cost</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Estimate details"
                          className="h-auto gap-1 p-0 text-xs text-muted-foreground"
                        >
                          {preview?.estimateKind === "measured"
                            ? "Measured"
                            : preview?.estimateKind === "not_used"
                              ? "AI disabled"
                              : preview?.estimateKind === "unavailable"
                                ? "No sample"
                                : "Provisional"}
                          <Info className="size-3" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {preview?.estimateBasis ??
                          "Loading current model prices."}{" "}
                        {preview?.estimateKind !== "not_used" &&
                          " Min assumes no paid requests; Max assumes every request uses its token allowance."}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <dl className="grid grid-cols-3 gap-3 tabular-nums">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Estimated
                      </dt>
                      <dd className="mt-1 text-lg font-semibold">
                        {estimated === null
                          ? preview
                            ? "--"
                            : "..."
                          : budgetPrice(estimated)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Min</dt>
                      <dd className="mt-1 text-lg">
                        {preview ? "US$0.00" : "..."}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Max</dt>
                      <dd className="mt-1 text-lg">
                        {maximum === null ? "..." : maximumPrice(maximum)}
                      </dd>
                    </div>
                  </dl>
                  <p
                    role={overBudget ? "alert" : "status"}
                    className={`flex min-h-10 items-start gap-2 text-xs ${overBudget ? "text-warning" : "text-muted-foreground"}`}
                  >
                    {overBudget && (
                      <TriangleAlert
                        className="mt-0.5 size-3 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    {!preview
                      ? "Loading current prices..."
                      : !allowAi
                        ? "AI is disabled. This import has no AI spend."
                        : available === 0
                          ? `No missing ${plural}. Refresh the ANU listing if you expect more.`
                          : overBudget
                            ? `May pause at your ${budgetPrice(budget)} spending limit.`
                            : `Within your ${budgetPrice(budget)} spending limit.`}
                  </p>
                </section>
              </>
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
          {(!progressScreen || unfinished) && (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 py-4">
              {progressScreen ? (
                <>
                  {unfinished && current.state === "active" && !active && (
                    <Button onClick={() => setActive(current.id)}>
                      Continue import
                    </Button>
                  )}
                  {unfinished && (
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
                  )}
                </>
              ) : (
                <Button
                  className="w-full sm:w-auto"
                  disabled={
                    pending ||
                    estimating ||
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
                        : `Import ${selected || limit} ${plural}`}
                </Button>
              )}
            </footer>
          )}
        </div>
      </AppShell>
    </Tabs>
  );
}
