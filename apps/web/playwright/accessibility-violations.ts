import assert from "node:assert/strict";

export function assertNoSeriousAccessibilityViolations(
  violations: readonly { impact?: string | null }[],
) {
  assert.deepEqual(
    violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
    [],
    "The page has serious or critical accessibility violations.",
  );
}
