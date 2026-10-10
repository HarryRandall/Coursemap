import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProvider } from "@/app/providers";
const mocks = vi.hoisted(() => ({
  modality: vi.fn(),
  toaster: vi.fn(() => null),
}));
vi.mock("@/lib/browser/use-input-modality", () => ({
  useInputModality: mocks.modality,
}));
vi.mock("@coursemap/ui/primitives/sonner", () => ({ Toaster: mocks.toaster }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
test("a route provider reuses the root's global UI and input listeners", () => {
  render(
    <AppProvider viewer={null} canAccessAdmin={false}>
      <AppProvider viewer={null} canAccessAdmin={false} renderGlobalUi={false}>
        Planner
      </AppProvider>
    </AppProvider>,
  );
  expect(mocks.modality).toHaveBeenCalledTimes(1);
  expect(mocks.toaster).toHaveBeenCalledTimes(1);
});
