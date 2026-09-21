import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { planStructureCodes } from "@/lib/coursemap/state";
import { AdminUserDetail } from "@/ui/admin/users/user-detail";
import type { AdminUserDetailData } from "@/lib/admin/users";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=study"),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// The detail view renders inside the application shell, which needs the
// sidebar and Coursemap providers. This assertion is about the study panel,
// so the shell stands in as a passthrough.
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const codeByYear = new Map([
  [1, "BCOMP"],
  [2, "SOFT-MAJ"],
  [3, "MATH-MIN"],
  [4, "STAT-MIN"],
  [5, "CYBER-SPEC"],
  [6, undefined],
]);

test("a plan keeps every selected minor and specialisation", () => {
  const codes = planStructureCodes(
    [
      { role: "programme", catalogue_record_id: 1 },
      { role: "major", catalogue_record_id: 2 },
      { role: "minor", catalogue_record_id: 3 },
      { role: "minor", catalogue_record_id: 4 },
      { role: "specialisation", catalogue_record_id: 5 },
    ],
    codeByYear,
    { degreeCode: "FALLBACK" },
  );

  expect(codes).toEqual({
    degreeCode: "BCOMP",
    majorCode: "SOFT-MAJ",
    minorCodes: ["MATH-MIN", "STAT-MIN"],
    specialisationCodes: ["CYBER-SPEC"],
  });
});

test("a structure with no resolvable code is dropped, not recorded blank", () => {
  const codes = planStructureCodes(
    [
      { role: "minor", catalogue_record_id: 3 },
      { role: "minor", catalogue_record_id: 6 },
    ],
    codeByYear,
    { degreeCode: "FALLBACK" },
  );

  expect(codes.minorCodes).toEqual(["MATH-MIN"]);
});

test("a plan with no programme keeps the profile's existing degree", () => {
  const codes = planStructureCodes([], codeByYear, { degreeCode: "BCOMP" });

  expect(codes.degreeCode).toBe("BCOMP");
  expect(codes.majorCode).toBe("");
  expect(codes.minorCodes).toEqual([]);
});

function adminUserData(): AdminUserDetailData {
  return {
    user: {
      userId: "user-1",
      email: "student@anu.edu.au",
      displayName: "Student",
      studentNumber: "u7499609",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-20T00:00:00.000Z",
    },
    roles: [],
    permissions: [],
    assignments: [],
    study: {
      plan: {
        id: "plan-1",
        name: "Bachelor of Computing",
        status: "active",
        catalogueYear: 2026,
        commencementYear: 2026,
        studyLoad: "full_time",
        extensionYears: 0,
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-20T00:00:00.000Z",
      },
      structures: [
        {
          role: "major",
          code: "SOFT-MAJ",
          name: "Software Development",
          units: 72,
        },
        { role: "minor", code: "MATH-MIN", name: "Mathematics", units: 24 },
        { role: "minor", code: "STAT-MIN", name: "Statistics", units: 24 },
        {
          role: "specialisation",
          code: "CYBER-SPEC",
          name: "Cyber Security",
          units: 24,
        },
      ],
      courses: [],
    },
  };
}

test("the administrator view lists every minor and specialisation a student selected", () => {
  render(
    <AdminUserDetail
      data={adminUserData()}
      currentUserId="admin-1"
      accountAgeDays={30}
    />,
  );

  expect(screen.getByText("Minors")).toBeInTheDocument();
  expect(
    screen.getByText("Mathematics (MATH-MIN), Statistics (STAT-MIN)"),
  ).toBeInTheDocument();
  expect(screen.getByText("Specialisations")).toBeInTheDocument();
  expect(screen.getByText("Cyber Security (CYBER-SPEC)")).toBeInTheDocument();
  expect(screen.getByText("Major")).toBeInTheDocument();
});
