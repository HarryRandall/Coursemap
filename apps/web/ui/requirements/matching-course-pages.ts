import type { Course } from "@/lib/coursemap/types";

export type MatchingCoursePage = {
  courses: Course[];
  total: number;
  nextCursor: string | null;
};

// Only public catalogue rows are cached. Plan status is read from the current context.
const pages = new Map<string, Promise<MatchingCoursePage>>();

/** One page of the published courses a bounded requirement matches. */
export function matchingCoursePage(query: string, cursor: string | null) {
  const url = `/api/requirements/courses?${query}&cursor=${cursor ?? "1"}`;
  const cached = pages.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then(async (response) => {
      if (!response.ok)
        throw new Error("Matching courses could not be loaded.");
      return (await response.json()) as MatchingCoursePage;
    })
    .catch((error: unknown) => {
      pages.delete(url);
      throw error;
    });
  pages.set(url, pending);
  return pending;
}
