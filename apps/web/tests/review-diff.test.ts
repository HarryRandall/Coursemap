import { expect, test } from "vitest";
import { diffLines } from "@/lib/catalogue/review-diff";

test("keeps shared lines as context and lists removals before additions", () => {
  expect(
    diffLines(["a", "b", "c"], ["a", "x", "c", "d"]).map(
      (line) => `${line.kind}:${line.text}`,
    ),
  ).toEqual(["same:a", "removed:b", "added:x", "same:c", "added:d"]);
});

test("marks the words that changed within a replaced line", () => {
  const [removed, added] = diffLines(
    ["course · 5520 · domestic"],
    ["course · 5720 · domestic"],
  );
  expect(removed!.parts).toEqual([
    { text: "course · ", changed: false },
    { text: "5520", changed: true },
    { text: " · domestic", changed: false },
  ]);
  expect(added!.parts?.find((part) => part.changed)?.text).toBe("5720");
});
