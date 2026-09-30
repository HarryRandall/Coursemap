import assert from "node:assert/strict";
import { test } from "vitest";
import { courseListSuggestions } from "../lib/catalogue/course-lists.ts";

const listA = {
  name: "List A",
  sourceUrl: "https://example.edu/a",
  codes: ["TSTL1001"],
};
const listB = { name: "List B", sourceUrl: null, codes: ["TSTL2002"] };

test("waiting tags come first, reusing an earlier list of the same name", () => {
  const suggestions = courseListSuggestions({
    lists: [],
    waiting: [
      { name: "list a", structureCodes: ["TSTP"] },
      { name: "List C", structureCodes: [] },
    ],
    previous: { year: 2025, lists: [listA, listB] },
  });
  assert.deepEqual(suggestions, [
    { label: "list a (from 2025)", template: listA },
    {
      label: "List C",
      template: { name: "List C", sourceUrl: null, codes: [] },
    },
    { label: "List B (from 2025)", template: listB },
  ]);
});

test("lists the year already has are not suggested again", () => {
  const suggestions = courseListSuggestions({
    lists: [
      {
        id: 1,
        name: "LIST B",
        sourceUrl: null,
        publishedAt: null,
        draftCodes: [],
        publishedCodes: [],
        unlistedCodes: [],
      },
    ],
    waiting: [],
    previous: { year: 2025, lists: [listA, listB] },
  });
  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.label),
    ["List A (from 2025)"],
  );
});
