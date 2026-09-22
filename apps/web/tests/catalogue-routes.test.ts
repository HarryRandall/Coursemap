import { expect, test } from "vitest";
import {
  adminCatalogueRecordPath,
  adminCatalogueVersionPath,
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

test("a version is addressed by its place in the record, not by a row id", () => {
  expect(adminCatalogueVersionPath("course", 2027, "COMP2700", 3)).toBe(
    "/admin/courses/2027/comp2700/changelog/3",
  );
  expect(adminCatalogueVersionPath("programme", 2027, "BCOMP", 12)).toBe(
    "/admin/programmes/2027/bcomp/changelog/12",
  );
});
