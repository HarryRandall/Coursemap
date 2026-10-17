"use client";
import { useEffect, useState } from "react";
import type { CourseDetails } from "@/lib/coursemap/course-types";

export type CourseDetailsState =
  | { status: "loading" | "error"; details: null }
  | { status: "ready"; details: CourseDetails };

// Published courses only change on import, so a course opened once in the
// session reopens instantly.
const cache = new Map<string, CourseDetails>();

/** The full published course, for views that open from a plan summary. */
export function useCourseDetails(
  code: string | null,
  year: number,
): CourseDetailsState {
  const key = `${year}:${code}`;
  const [result, setResult] = useState<{
    key: string;
    state: CourseDetailsState;
  } | null>(null);

  useEffect(() => {
    if (!code || cache.has(key)) return;
    const controller = new AbortController();
    fetch(`/api/courses/${encodeURIComponent(code)}/details?year=${year}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Course details are unavailable.");
        const payload = (await response.json()) as { course?: CourseDetails };
        if (!payload.course) throw new Error("Course details are unavailable.");
        return payload.course;
      })
      .then((details) => {
        cache.set(key, details);
        if (!controller.signal.aborted)
          setResult({ key, state: { status: "ready", details } });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ key, state: { status: "error", details: null } });
      });
    return () => controller.abort();
  }, [code, key, year]);

  const cached = cache.get(key);
  if (cached) return { status: "ready", details: cached };
  return result?.key === key
    ? result.state
    : { status: "loading", details: null };
}
