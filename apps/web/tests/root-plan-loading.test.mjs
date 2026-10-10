import { expect, test, vi } from "vitest";
import RootLayout from "@/app/layout";

const mocks = vi.hoisted(() => ({
  plan: vi.fn(async () => undefined),
  profile: vi.fn(async () => ({ profile: { name: "Student" }, attempts: [] })),
  guest: vi.fn(async () => null),
  viewer: vi.fn(async () => ({
    viewer: { id: "student" },
    canAccessAdmin: false,
  })),
}));
vi.mock("geist/font/mono", () => ({ GeistMono: { variable: "mono" } }));
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "sans" } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/viewer", () => ({ getAuthContext: mocks.viewer }));
vi.mock("@/lib/coursemap/state", () => ({
  loadCoursemapState: mocks.plan,
  loadProfileState: mocks.profile,
}));
vi.mock("@/lib/coursemap/guest-plan-server", () => ({
  readGuestPlan: mocks.guest,
}));
vi.mock("@/lib/supabase/config", () => ({
  getCanonicalSiteOrigin: () => null,
}));

test("the root shell loads profile basics without reading the student's plan", async () => {
  await RootLayout({ children: "Rooms" });
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(mocks.profile).toHaveBeenCalledWith({ id: "student" });
});

test("the root shell keeps the guest cookie as its initial state", async () => {
  const guest = {
    profile: { name: "Guest" },
    attempts: [{ courseCode: "COMP1100" }],
  };
  mocks.viewer.mockResolvedValueOnce({ viewer: null, canAccessAdmin: false });
  mocks.guest.mockResolvedValueOnce(guest);
  const root = await RootLayout({ children: "Rooms" });
  const provider = root.props.children[1].props.children.props.children;
  expect(provider.props.initialState).toBe(guest);
  expect(provider.props.guest).toBe(true);
});
