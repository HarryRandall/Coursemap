import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminLayout from "@/app/admin/layout";

const { getAuthContext, redirect } = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`Redirect: ${href}`);
  }),
}));

vi.mock("@/lib/auth/viewer", () => ({ getAuthContext }));
vi.mock("@/lib/coursemap/state", () => ({
  loadAdminShellState: async () => ({
    schemaVersion: 1,
    profile: {},
    attempts: [],
  }),
}));
vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ refresh: vi.fn() }),
}));

test("signed-in users without admin permission see the access error instead of protected content", async () => {
  getAuthContext.mockResolvedValue({
    viewer: { id: "student" },
    canAccessAdmin: false,
  });
  render(await AdminLayout({ children: <p>Protected admin content</p> }));
  expect(
    screen.getByRole("heading", { name: "This page needs a different key" }),
  ).toBeVisible();
  expect(screen.queryByText("Protected admin content")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
});

test("anonymous users still go to sign in", async () => {
  getAuthContext.mockResolvedValue({ viewer: null, canAccessAdmin: false });
  await expect(
    AdminLayout({ children: <p>Protected admin content</p> }),
  ).rejects.toThrow("Redirect: /login?next=%2Fadmin%2Fdashboard");
});

test("authorised users retain access to the requested admin page", async () => {
  getAuthContext.mockResolvedValue({
    viewer: { id: "admin" },
    canAccessAdmin: true,
  });
  render(await AdminLayout({ children: <p>Protected admin content</p> }));
  expect(screen.getByText("Protected admin content")).toBeVisible();
});
