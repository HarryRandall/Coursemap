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
