import assert from "node:assert/strict";
import { test } from "vitest";

import { validateAnuCoursePage } from "../lib/catalogue-import/kinds/course/source.ts";
import { validateAnuAcademicStructurePage } from "../lib/catalogue-import/kinds/structure/source.ts";

const sources = [
  {
    label: "course",
    code: "FINM3009",
    prefix: "course",
    missingCode: "MISSING_COURSE_YEAR",
    mismatchCode: "COURSE_YEAR_MISMATCH",
    validate(html) {
      return validateAnuCoursePage({
        html,
        expectedCourseCode: this.code,
        expectedYear: 2024,
      });
    },
  },
  {
    label: "programme",
    code: "BFINN",
    prefix: "program",
    missingCode: "MISSING_STRUCTURE_YEAR",
    mismatchCode: "STRUCTURE_YEAR_MISMATCH",
    validate(html) {
      return validateAnuAcademicStructurePage({
        html,
        expectedKind: "programme",
        expectedCode: this.code,
        expectedYear: 2024,
      });
    },
  },
];

for (const source of sources) {
  test(`${source.label} source year metadata distinguishes missing from mismatch`, () => {
    const page = (year) => `<html><head>
      <meta name="${source.prefix}-code" content="${source.code}">
      <meta name="${source.prefix}-name" content="Finance">
      ${year === null ? "" : `<meta name="${source.prefix}-year" content="${year}">`}
    </head><body><h1>Finance</h1></body></html>`;

    for (const year of [null, "2024.0"]) {
      const result = source.validate(page(year));
      assert.equal(result.valid, false);
      assert.ok(result.issues.some(({ code }) => code === source.missingCode));
      assert.ok(
        !result.issues.some(({ code }) => code === source.mismatchCode),
      );
    }
    const mismatch = source.validate(page("2025"));
    assert.equal(mismatch.valid, false);
    assert.ok(mismatch.issues.some(({ code }) => code === source.mismatchCode));
    assert.equal(source.validate(page("2024")).valid, true);
  });
}
