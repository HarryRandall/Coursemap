import { beforeEach, expect, test, vi } from "vitest";
import { getAuthContext, canManageRooms } from "@/lib/auth/viewer";
const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  rpc: vi.fn(),
  entries: new Map<unknown, Map<string, unknown>>(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const entries = mocks.entries.get(fn) ?? new Map<string, unknown>();
      mocks.entries.set(fn, entries);
      const key = JSON.stringify(args);
      if (!entries.has(key)) entries.set(key, fn(...args));
      return entries.get(key);
    },
}));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseConfig: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: mocks.claims },
    rpc: mocks.rpc,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.entries.clear();
  mocks.claims.mockResolvedValue({
    data: { claims: { sub: "student", email: "student@example.test" } },
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
test("auth and permission consumers share checks within a request", async () => {
  const [auth, first, second] = await Promise.all([
    getAuthContext(),
    canManageRooms(),
    canManageRooms(),
  ]);
  expect(auth.viewer?.id).toBe("student");
  expect(first && second).toBe(true);
  expect(mocks.claims).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
test("the next request checks a revoked permission again", async () => {
  expect(await canManageRooms()).toBe(true);
  mocks.entries.clear();
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  expect(await canManageRooms()).toBe(false);
});
