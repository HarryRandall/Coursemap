import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ viewer: vi.fn(), load: vi.fn() }));
vi.mock("../lib/auth/viewer", () => ({ getAuthViewer: mocks.viewer }));
vi.mock("../lib/course-surveys/published-surveys", () => ({
  loadPublishedSurveyReport: mocks.load,
}));
import { GET } from "../app/api/courses/[code]/surveys/route";
function request(code = "comp1100") {
  return GET(new Request("http://localhost/api/courses/" + code + "/surveys"), {
    params: Promise.resolve({ code }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer.mockResolvedValue({ id: "student" });
  mocks.load.mockResolvedValue(null);
});
it("returns a published report to anonymous viewers without reading their session", async () => {
  mocks.viewer.mockResolvedValue(null);
  const report = { courseCode: "COMP1100", surveys: [] };
  mocks.load.mockResolvedValue(report);
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ report });
  expect(mocks.viewer).not.toHaveBeenCalled();
  expect(mocks.load).toHaveBeenCalledWith("COMP1100");
});
it("returns an explicit empty result for unpublished reports", async () => {
  mocks.viewer.mockResolvedValue(null);
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ report: null });
  expect(response.headers.get("cache-control")).toBe(
    "public, max-age=0, s-maxage=60",
  );
  expect(mocks.load).toHaveBeenCalledWith("COMP1100");
});
it("uses the same public read for signed-in viewers", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(mocks.viewer).not.toHaveBeenCalled();
  expect(mocks.load).toHaveBeenCalledWith("COMP1100");
});
it("validates course codes and sanitises database failures", async () => {
  const invalid = await request("invalid");
  expect(invalid.status).toBe(400);
  expect(invalid.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.load).not.toHaveBeenCalled();
  mocks.load.mockRejectedValue(new Error("private database details"));
  const response = await request();
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).not.toContain("private database");
});
