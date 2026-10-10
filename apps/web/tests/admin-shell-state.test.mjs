import { expect, test, vi } from "vitest";
import AdminLayout from "@/app/admin/layout";
const state = {
  profile: { name: "Student", catalogueYear: 2027 },
  attempts: [],
};
vi.mock("@/lib/auth/viewer", () => ({
  getAuthContext: async () => ({
    viewer: { id: "student" },
    canAccessAdmin: true,
  }),
}));
vi.mock("@/lib/coursemap/state", () => ({
  loadAdminShellState: async () => state,
}));
test("admin navigation retains the student's catalogue year without loading their courses", async () => {
  const provider = await AdminLayout({ children: "Admin dashboard" });
  expect(provider.props.initialState).toBe(state);
  expect(provider.props.children).toBe("Admin dashboard");
  expect(provider.props.renderGlobalUi).toBe(false);
});
