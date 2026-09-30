export type AdminCourseList = {
  id: number;
  name: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  draftCodes: string[];
  publishedCodes: string[];
  /** Draft codes with no course listing in the list's year. */
  unlistedCodes: string[];
};

/** A list from an earlier year, offered as a starting point. */
export type CourseListTemplate = {
  name: string;
  sourceUrl: string | null;
  codes: string[];
};

/** A tag a structure rule counts that no list or course carries yet. */
export type WaitingCourseList = {
  name: string;
  structureCodes: string[];
};

export type AdminCourseListsYear = {
  lists: AdminCourseList[];
  waiting: WaitingCourseList[];
  previous: { year: number; lists: CourseListTemplate[] } | null;
};

export type CourseListSuggestion = {
  label: string;
  template: CourseListTemplate;
};

/**
 * Starting points for a new list: tags this year's rules wait for, then the
 * earlier year's lists this year does not have yet.
 */
export function courseListSuggestions({
  lists,
  previous,
  waiting,
}: AdminCourseListsYear): CourseListSuggestion[] {
  const taken = new Set(lists.map((list) => list.name.toLowerCase()));
  const earlier = new Map(
    (previous?.lists ?? []).map((list) => [list.name.toLowerCase(), list]),
  );
  const suggestions: CourseListSuggestion[] = waiting.map((tag) => ({
    label: earlier.has(tag.name.toLowerCase())
      ? `${tag.name} (from ${previous!.year})`
      : tag.name,
    template: earlier.get(tag.name.toLowerCase()) ?? {
      name: tag.name,
      sourceUrl: null,
      codes: [],
    },
  }));
  const suggested = new Set(waiting.map((tag) => tag.name.toLowerCase()));
  for (const list of previous?.lists ?? []) {
    const key = list.name.toLowerCase();
    if (taken.has(key) || suggested.has(key)) continue;
    suggestions.push({
      label: `${list.name} (from ${previous!.year})`,
      template: list,
    });
  }
  return suggestions;
}

/** What publishing the draft would change; both lists are sorted. */
export function courseListChanges({
  draftCodes,
  publishedCodes,
}: Pick<AdminCourseList, "draftCodes" | "publishedCodes">) {
  const draft = new Set(draftCodes);
  const published = new Set(publishedCodes);
  return {
    added: draftCodes.filter((code) => !published.has(code)).sort(),
    removed: publishedCodes.filter((code) => !draft.has(code)).sort(),
  };
}
