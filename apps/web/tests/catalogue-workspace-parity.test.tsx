import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { StructureEmptyWorkspace } from "@/ui/admin/academic-structures/structure-empty-workspace";
import { adminAcademicStructureDetailPath } from "@/lib/coursemap/academic-structure-routes";
import type { AcademicStructureKind } from "@/lib/structure-import/contract";

vi.mock("@/ui/shell", () => ({
  AppShell: ({ children, tabs }: { children: ReactNode; tabs?: ReactNode }) => (
    <main>
      {tabs}
      {children}
    </main>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/programmes/test",
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(cleanup);

test.each([
  "programme",
  "major",
  "minor",
  "specialisation",
] satisfies AcademicStructureKind[])(
  "an unimported %s has an import action and no empty tabs",
  (kind) => {
    render(
      <StructureEmptyWorkspace
        entry={{
          code: "TEST",
          kind,
          year: 2026,
          title: "Test",
          publicId: "test",
          importEnabled: true,
          imports: [],
          versions: [],
        }}
        detail={null}
        canImport
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No imports yet" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: `Import ${kind}` }),
    ).toBeEnabled();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(adminAcademicStructureDetailPath({ kind, publicId: "test" })).toBe(
      `/admin/${kind === "specialisation" ? "specialisations" : `${kind}s`}/test`,
    );
  },
);
