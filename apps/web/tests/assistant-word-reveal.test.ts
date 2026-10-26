import { expect, test } from "vitest";
import { nextWordBoundary } from "@/ui/assistant/use-word-reveal";

test("reveals replies a whole word at a time", () => {
  const text = "Take COMP2120 in S2.";
  expect(text.slice(0, nextWordBoundary(text, 0, 1))).toBe("Take ");
  expect(text.slice(0, nextWordBoundary(text, 5, 2))).toBe("Take COMP2120 in ");
  expect(nextWordBoundary(text, 17, 5)).toBe(text.length);
});
