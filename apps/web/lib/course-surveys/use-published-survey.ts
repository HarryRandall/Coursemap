"use client";
import { useCallback, useEffect, useState } from "react";
import type { PublishedSurveyReport } from "./report-model";

type SurveyResult =
  | { status: "loading" | "empty"; report: null }
  | { status: "error"; report: null }
  | { status: "ready"; report: PublishedSurveyReport };
export type PublishedSurveyState =
  | Exclude<SurveyResult, { status: "error" }>
  | { status: "error"; report: null; retry: () => void };

export function usePublishedSurvey(courseCode: string): PublishedSurveyState {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const [result, setResult] = useState<{
    code: string;
    attempt: number;
    survey: SurveyResult;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/courses/${encodeURIComponent(courseCode)}/surveys`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The survey request failed.");
        const result = await response.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("report" in result) ||
          (result.report !== null && !Array.isArray(result.report?.surveys))
        )
          throw new Error("The survey response could not be read.");
        return result.report as PublishedSurveyReport | null;
      })
      .then((report) => {
        if (!controller.signal.aborted)
          setResult({
            code: courseCode,
            attempt,
            survey: report
              ? { status: "ready", report }
              : { status: "empty", report: null },
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({
            code: courseCode,
            attempt,
            survey: { status: "error", report: null },
          });
      });
    return () => controller.abort();
  }, [courseCode, attempt]);
  if (result?.code !== courseCode || result.attempt !== attempt)
    return { status: "loading", report: null };
  return result.survey.status === "error"
    ? { status: "error", report: null, retry }
    : result.survey;
}
