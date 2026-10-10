import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  publicClient: vi.fn(),
  sessionClient: vi.fn(),
}));
vi.mock("../lib/supabase/public-server", () => ({
  createPublicClient: mocks.publicClient,
}));
vi.mock("../lib/supabase/server", () => ({
  createClient: mocks.sessionClient,
}));
import { loadPublishedSurveyReport } from "../lib/course-surveys/published-surveys";

function query(data: unknown) {
  const result = { data, error: null };
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  };
}
const reportRow = {
  id: "report",
  source_name: "ANU SELT",
  source_url: "https://example.test/report.pdf",
  report_run_at: null,
  notes: [],
};
function client({
  identity = true,
  publishedCourse = true,
  publishedReport = true,
} = {}) {
  const queries = {
    catalogue_codes: query(identity ? { id: 123 } : null),
    catalogue_records: query(publishedCourse ? { id: 456 } : null),
    selt_reports: query(publishedReport ? reportRow : null),
    selt_surveys: query([]),
  };
  const from = vi.fn((table: keyof typeof queries) => queries[table]);
  mocks.publicClient.mockReturnValue({ from });
  mocks.sessionClient.mockResolvedValue({ from });
  return { from, queries };
}
beforeEach(() => vi.clearAllMocks());
it("reads only public report fields through the cookie-free client", async () => {
  const { queries } = client();
  expect(await loadPublishedSurveyReport("COMP1100")).toEqual({
    courseCode: "COMP1100",
    sourceName: "ANU SELT",
    sourceUrl: reportRow.source_url,
    reportRunAt: null,
    notes: [],
    surveys: [],
  });
  expect(mocks.publicClient).toHaveBeenCalledOnce();
  expect(mocks.sessionClient).not.toHaveBeenCalled();
  expect(queries.selt_reports.select).toHaveBeenCalledWith(
    "id, source_name, source_url, report_run_at, notes",
  );
  expect(queries.selt_reports.not).toHaveBeenCalledWith(
    "published_at",
    "is",
    null,
  );
});
it("requires a readable, published and unarchived course record, even for a visible placeholder code", async () => {
  const { from, queries } = client({ publishedCourse: false });
  expect(await loadPublishedSurveyReport("COMP1100")).toBeNull();
  expect(queries.catalogue_records.eq).toHaveBeenCalledWith("code_id", 123);
  expect(queries.catalogue_records.not).toHaveBeenCalledWith(
    "published_version_id",
    "is",
    null,
  );
  expect(queries.catalogue_records.is).toHaveBeenCalledWith(
    "archived_at",
    null,
  );
  expect(from).not.toHaveBeenCalledWith("selt_reports");
});
it("does not query reports for an unreadable course code", async () => {
  const { from } = client({ identity: false });
  expect(await loadPublishedSurveyReport("COMP1100")).toBeNull();
  expect(from).not.toHaveBeenCalledWith("selt_reports");
});
it("returns no report when none is published", async () => {
  const { from } = client({ publishedReport: false });
  expect(await loadPublishedSurveyReport("COMP1100")).toBeNull();
  expect(from).not.toHaveBeenCalledWith("selt_surveys");
});
it("propagates catalogue failures instead of treating them as no report", async () => {
  const { queries } = client();
  queries.catalogue_records.maybeSingle.mockResolvedValueOnce({
    data: null,
    error: new Error("unavailable"),
  });
  await expect(loadPublishedSurveyReport("COMP1100")).rejects.toThrow(
    "The survey course could not be loaded.",
  );
});
