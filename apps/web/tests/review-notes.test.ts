import { expect, test } from "vitest";

import {
  modelFieldLabel,
  summariseReviewNotes,
} from "@/lib/catalogue/review-notes";

test("model field paths read as the fields an administrator knows", () => {
  expect(modelFieldLabel("requisites.prerequisiteRule")).toBe(
    "Prerequisite rule",
  );
  expect(modelFieldLabel("fees[2]")).toBe("Fees, item 3");
  expect(modelFieldLabel("requirements.rule.children.3.children.0")).toBe(
    "Requirements, branch 4.1",
  );
  expect(modelFieldLabel("offerings[1].startsOn")).toBe(
    "Offerings, item 2, starts on",
  );
  expect(modelFieldLabel("atar")).toBe("ATAR");
  expect(modelFieldLabel("modelExtraction")).toBe("The whole response");
  expect(modelFieldLabel(null)).toBe("The record");
});

test("a field is listed once, at its weakest evidence", () => {
  const { uncertain } = summariseReviewNotes({
    flags: [],
    evidence: [
      { fieldPath: "fees", confidence: 0.6, excerpt: "first" },
      { fieldPath: "fees", confidence: 0.4, excerpt: "weakest" },
      { fieldPath: "title", confidence: null, excerpt: null },
      { fieldPath: "college", confidence: 0.8, excerpt: "at the threshold" },
    ],
  });
  expect(uncertain).toEqual([
    {
      fieldPath: "fees",
      label: "Fees",
      confidence: 0.4,
      excerpt: "weakest",
    },
  ]);
});
