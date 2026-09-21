import { expect, test } from "vitest";
import {
  adminCatalogueRecordPath,
  adminCatalogueYearPath,
  publicCatalogueRecordPath,
} from "@/lib/coursemap/catalogue-kinds";

test("catalogue paths put the year before a lowercase human-readable code", () => {
  expect(adminCatalogueYearPath("course", 2027)).toBe("/admin/courses/2027");
  expect(adminCatalogueRecordPath("course", 2027, "COMP2700")).toBe(
    "/admin/courses/2027/comp2700",
  );
  expect(publicCatalogueRecordPath("course", 2027, "COMP2700")).toBe(
    "/courses/2027/comp2700",
  );
  expect(publicCatalogueRecordPath("programme", 2027, "BCOMP")).toBe(
    "/programmes/2027/bcomp",
  );
  expect(publicCatalogueRecordPath("specialisation", 2027, "DATA-SCI")).toBe(
    "/specialisations/2027/data-sci",
  );
});
