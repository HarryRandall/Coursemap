import { describe, expect, it } from "vitest";
import { selectPreferredCourseYears } from "../lib/coursemap/published-directory-selection";

describe("course directory years", () => {
  it("lists each code once, preferring 2026 and falling back to the latest published year", () => {
    const rows = [
      { code: "COMP1000", academic_year: 2025 },
      { code: "MATH1000", academic_year: 2024 },
      { code: "COMP1000", academic_year: 2027 },
      { code: "MATH1000", academic_year: 2025 },
      { code: "COMP1000", academic_year: 2026 },
      { code: "LAWS1000", academic_year: 2027 },
    ];

    expect(selectPreferredCourseYears(rows)).toEqual([
      { code: "COMP1000", academic_year: 2026 },
      { code: "MATH1000", academic_year: 2025 },
      { code: "LAWS1000", academic_year: 2027 },
    ]);
  });
});
