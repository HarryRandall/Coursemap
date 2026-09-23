import { expect, test } from "vitest";
import {
  commencementYearOptions,
  rulesYearForCommencement,
} from "../lib/coursemap/commencement";
import { normaliseStudentNumber } from "../lib/coursemap/student-number";

test("offers this year and the five before it", () => {
  expect(commencementYearOptions(2026)).toEqual([
    2026, 2025, 2024, 2023, 2022, 2021,
  ]);
});

test("follows the rules of the year a student started", () => {
  expect(rulesYearForCommencement(2024, [2026, 2025, 2024])).toBe(2024);
});

test("uses the closest published rules when the start year is missing", () => {
  expect(rulesYearForCommencement(2021, [2026, 2025, 2024])).toBe(2024);
  expect(rulesYearForCommencement(2027, [2026, 2025])).toBe(2026);
  expect(rulesYearForCommencement(2024, [2023, 2025])).toBe(2025);
  expect(rulesYearForCommencement(2024, [])).toBeNull();
});

test("student numbers are optional but must match the ANU format", () => {
  expect(normaliseStudentNumber("  ")).toBe("");
  expect(normaliseStudentNumber(" U1234567 ")).toBe("u1234567");
  expect(normaliseStudentNumber("1234567")).toBeNull();
});
