import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { CatalogueOperationsError } from "@/ui/admin/operations/operations-error";

vi.mock("@/ui/shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="admin-shell">{children}</div>
  ),
}));

test("keeps the admin shell around catalogue operations errors", () => {
  const reset = vi.fn();
  render(
    <CatalogueOperationsError
      error={Object.assign(new Error("failed"), { digest: "reference-123" })}
      reset={reset}
    />,
  );

  expect(screen.getByTestId("admin-shell")).toBeTruthy();
  expect(
    screen.getByRole("heading", {
      name: "We couldn't load catalogue activity",
    }),
  ).toBeTruthy();
  expect(screen.getByText("Error reference: reference-123")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Back to overview" }).getAttribute("href"),
  ).toBe("/admin/dashboard");

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalledOnce();
});
