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
it("requires sign-in before looking up survey reports", async () => {
  mocks.viewer.mockResolvedValue(null);
  expect((await request()).status).toBe(401);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("returns an explicit empty result and prevents shared caching", async () => {
  const response = await request();
  expect(await response.json()).toEqual({ report: null });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.load).toHaveBeenCalledWith("COMP1100");
});
it("validates course codes and sanitises database failures", async () => {
  expect((await request("invalid")).status).toBe(400);
  mocks.load.mockRejectedValue(new Error("private database details"));
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database");
});
