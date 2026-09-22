import { expect, test } from "vitest";
import { adminCatalogueNavigationYear } from "@/ui/shell/app-sidebar";

test("admin catalogue navigation preserves the year being viewed", () => {
  expect(adminCatalogueNavigationYear("/admin/courses/2027", 2026)).toBe(2027);
  expect(
    adminCatalogueNavigationYear("/admin/majors/2025/MATH-MAJ", 2026),
  ).toBe(2025);
});

test("admin catalogue navigation falls back to the profile catalogue year", () => {
  expect(adminCatalogueNavigationYear("/admin/dashboard", 2026)).toBe(2026);
  expect(
    adminCatalogueNavigationYear("/admin/operations/catalogue", 2026),
  ).toBe(2026);
});
