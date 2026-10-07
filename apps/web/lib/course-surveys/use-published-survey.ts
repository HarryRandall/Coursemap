"use client";
import { useEffect, useState } from "react";
import type { PublishedSurveyReport } from "./report-model";

/** Keep the review tab absent until a published report has been confirmed. */
export function usePublishedSurvey(courseCode: string) {
  const [result, setResult] = useState<{
    code: string;
    report: PublishedSurveyReport | null;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/courses/${encodeURIComponent(courseCode)}/surveys`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const result = await response.json();
        return result.report as PublishedSurveyReport | null;
      })
      .then((report) => {
        if (!controller.signal.aborted)
          setResult({
            code: courseCode,
            report: report?.surveys.length ? report : null,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ code: courseCode, report: null });
      });
    return () => controller.abort();
  }, [courseCode]);
  return result?.code === courseCode ? result.report : null;
}
