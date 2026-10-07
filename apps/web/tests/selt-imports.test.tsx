import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SeltImports } from "../ui/admin/selt/selt-imports";
const run = {
  id: "run",
  reports: 1,
  revoked_at: null,
  expires_at: "2099-01-01T00:00:00Z",
};
const report = {
  id: "report",
  code: "TEST1234",
  course_name: "Synthetic course",
  periods: 1,
  published_at: null,
  warnings: [],
  notes: [],
  source_url: "https://unistats.anu.edu.au/example.pdf",
};
afterEach(() => vi.unstubAllGlobals());
it("shows empty state, reveals a token once and hides it on request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) =>
      Response.json(
        options?.method === "POST"
          ? { token: "synthetic-import-token" }
          : { runs: [], reports: [] },
      ),
    ),
  );
  render(<SeltImports canPublish />);
  expect(await screen.findByText("No local imports yet.")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Create local import token" }),
  );
  expect(await screen.findByText("synthetic-import-token")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Hide token" }));
  expect(screen.queryByText("synthetic-import-token")).not.toBeInTheDocument();
});
it("blocks publication when extraction has warnings and reviews missing values as unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      Response.json(
        String(url).includes("reportId")
          ? {
              surveys: [
                {
                  label: "Sem 1 2025",
                  enrolments: 100,
                  respondents: 20,
                  response_rate_percent: 20,
                  teaching_and_learning_activities: null,
                  workload: 60,
                  feedback: 50,
                  analytical_development: 70,
                  overall_learning_experience: 80,
                },
              ],
            }
          : {
              runs: [run],
              reports: [{ ...report, warnings: ["Review the chart."] }],
            },
      ),
    ),
  );
  render(<SeltImports canPublish />);
  expect(await screen.findByText("TEST1234")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(await screen.findByText("Unavailable")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Original ANU report" }),
  ).toHaveAttribute("href", report.source_url);
});
it("reports upload-control failures without inventing a successful import", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: "Import permission is required." },
        { status: 403 },
      ),
    ),
  );
  render(<SeltImports canPublish={false} />);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "SELT reports could not be loaded.",
    ),
  );
});
