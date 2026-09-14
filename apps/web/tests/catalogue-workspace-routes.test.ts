import { expect, test } from "vitest";
import {
  catalogueWorkspacePath,
  catalogueWorkspaceView,
} from "@/lib/coursemap/catalogue-workspace-routes";
const base = "/admin/programmes/7d8c3cba-6b48-4c34-9d1b-718e36940d41";
test("workspace navigation uses explicit routes and keeps import selection", () => {
  expect(catalogueWorkspacePath(base, "history", "import=abc")).toBe(
    `${base}/history?import=abc`,
  );
  expect(catalogueWorkspacePath(`${base}/history`, "preview")).toBe(
    `${base}/preview`,
  );
  expect(catalogueWorkspacePath(`${base}/versions/version-id`)).toBe(base);
  expect(catalogueWorkspacePath(base, "requirements")).toBe(
    `${base}?section=requirements`,
  );
});
test("query strings cannot select a legacy view", () => {
  expect(
    catalogueWorkspaceView(base, new URLSearchParams("view=history")),
  ).toBe("review");
  expect(catalogueWorkspaceView(`${base}/history`, new URLSearchParams())).toBe(
    "history",
  );
});
