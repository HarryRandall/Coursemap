import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requestClient: vi.fn(), claims: vi.fn() }));
vi.mock("../lib/supabase/config", () => ({
  getSupabaseConfig: () => ({
    url: "http://localhost",
    publishableKey: "test",
  }),
  getSiteOriginForRequest: () => "http://localhost",
}));
vi.mock("../lib/supabase/request", () => ({
  createRequestClient: mocks.requestClient,
}));
import { proxy } from "../proxy";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({
    data: { claims: { sub: "student" } },
    error: null,
  });
  mocks.requestClient.mockReturnValue({
    supabase: { auth: { getClaims: mocks.claims } },
    applyTo: (response: Response) => response,
  });
});
it.each(["", "coursemap-guest=plan", "sb-test-auth-token=session"])(
  "keeps survey requests independent of viewer cookies (%s)",
  async (cookie) => {
    if (!cookie.startsWith("sb-"))
      mocks.claims.mockResolvedValue({ data: null, error: null });
    const response = await proxy(
      new NextRequest("http://localhost/api/courses/COMP1100/surveys", {
        headers: { cookie },
      }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.requestClient).not.toHaveBeenCalled();
    expect(mocks.claims).not.toHaveBeenCalled();
  },
);
it("preserves session handling and private caching on other routes", async () => {
  const response = await proxy(new NextRequest("http://localhost/dashboard"));
  expect(mocks.claims).toHaveBeenCalledOnce();
  expect(response.headers.get("cache-control")).toContain("private");
});
it("still redirects anonymous readers away from administration", async () => {
  mocks.claims.mockResolvedValue({ data: null, error: null });
  const response = await proxy(new NextRequest("http://localhost/admin/selt"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    "http://localhost/login?next=%2Fadmin%2Fselt",
  );
});
