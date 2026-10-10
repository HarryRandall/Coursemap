import { expect, test } from "vitest";
import { assertNoSeriousAccessibilityViolations } from "../playwright/accessibility-violations";

test.each(["serious", "critical"])(
  "fails the accessibility gate for %s violations",
  (impact) => {
    expect(() => assertNoSeriousAccessibilityViolations([{ impact }])).toThrow(
      "The page has serious or critical accessibility violations.",
    );
  },
);

test("allows lower-impact findings and pages without violations", () => {
  expect(() => assertNoSeriousAccessibilityViolations([])).not.toThrow();
  expect(() =>
    assertNoSeriousAccessibilityViolations([
      { impact: "moderate" },
      { impact: "minor" },
      { impact: null },
      {},
    ]),
  ).not.toThrow();
});

test("retains rule and element details when a mixed scan fails", () => {
  const violations = [
    { id: "region", impact: "moderate", nodes: [{ target: ["aside"] }] },
    { id: "button-name", impact: "critical", nodes: [{ target: ["#save"] }] },
  ];
  try {
    assertNoSeriousAccessibilityViolations(violations);
    expect.fail("The accessibility gate should reject the critical finding.");
  } catch (error) {
    expect(error).toHaveProperty("actual", [violations[1]]);
  }
});
