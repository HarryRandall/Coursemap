import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportArtefactViewer } from "@/ui/admin/imports/import-artefact-viewer";
const artifact = {
  id: "artefact-1",
  kind: "validated_json",
  attemptNumber: 1,
  mediaType: "application/json",
};
afterEach(() => vi.unstubAllGlobals());
test("loads JSON artefacts through the supplied endpoint", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response('{"course":"COMP3900"}'));
  vi.stubGlobal("fetch", fetcher);
  render(
    <ImportArtefactViewer
      artifacts={[artifact]}
      endpoint="/api/admin/course-imports/artifacts"
    />,
  );
  expect(await screen.findByText(/COMP3900/)).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/admin/course-imports/artifacts/artefact-1",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(screen.getByRole("tab", { name: "Validated JSON" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
test("reports failed artefact requests and retries", async () => {
  const user = userEvent.setup();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('{"error":"Please retry"}', { status: 500 }),
    )
    .mockResolvedValueOnce(new Response('{"course":"COMP2100"}'));
  vi.stubGlobal("fetch", fetcher);
  render(
    <ImportArtefactViewer
      artifacts={[artifact]}
      endpoint="/api/admin/academic-structure-imports/artifacts"
    />,
  );
  expect(await screen.findByText("Please retry")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Retry loading" }));
  expect(await screen.findByText(/COMP2100/)).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
test("keeps database projections out of artefact navigation", () => {
  render(
    <ImportArtefactViewer
      artifacts={[{ ...artifact, kind: "database_projection" }]}
      endpoint="/api/admin/course-imports/artifacts"
    />,
  );
  expect(
    screen.getByRole("heading", { name: "No source artefacts yet" }),
  ).toBeVisible();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/imports",
  useSearchParams: () => new URLSearchParams(),
}));

import { CourseReviewTabs } from "@/ui/admin/imports/course-review-tabs";
import { Tabs } from "@coursemap/ui/primitives/tabs";
test("course views remain above the editor and preview is last", () => {
  const { rerender } = render(
    <Tabs defaultValue="review">
      <CourseReviewTabs hasData={false} activeTab="review" />
    </Tabs>,
  );
  expect(
    screen.queryByRole("tab", { name: "Summary" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Review" })).toBeEnabled();
  expect(screen.getByRole("tab", { name: "History" })).toBeEnabled();
  expect(screen.getByRole("tab", { name: "Preview" })).toBeDisabled();
  expect(screen.getAllByRole("tab").at(-1)).toHaveTextContent("Preview");
  rerender(
    <Tabs defaultValue="review">
      <CourseReviewTabs activeTab="review" editing />
    </Tabs>,
  );
  expect(screen.getByRole("tab", { name: "History" })).toBeDisabled();
  expect(
    screen.queryByRole("tab", { name: "Summary" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Review" })).toBeEnabled();
});
