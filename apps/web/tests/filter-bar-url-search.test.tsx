import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { FilterBar } from "@/ui/common/filter-bar";

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => "/admin/catalogue/minors/2026",
  useSearchParams: () => navigation.params,
}));

function Bar() {
  return (
    <TooltipProvider>
      <FilterBar searchPlaceholder="Search minors" />
    </TooltipProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  navigation.params = new URLSearchParams();
  navigation.replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function land(query: string, rerender: (ui: React.ReactElement) => void) {
  navigation.params = new URLSearchParams(query ? { q: query } : {});
  rerender(<Bar />);
}

test("an earlier search landing does not overwrite what is still being typed", () => {
  const { rerender } = render(<Bar />);
  const input = screen.getByRole("searchbox");

  fireEvent.change(input, { target: { value: "micro" } });
  act(() => vi.advanceTimersByTime(250));
  expect(navigation.replace).toHaveBeenLastCalledWith(
    "/admin/catalogue/minors/2026?q=micro",
    { scroll: false },
  );

  fireEvent.change(input, { target: { value: "microprocessor" } });
  land("micro", rerender);
  expect(input).toHaveValue("microprocessor");

  act(() => vi.advanceTimersByTime(250));
  expect(navigation.replace).toHaveBeenLastCalledWith(
    "/admin/catalogue/minors/2026?q=microprocessor",
    { scroll: false },
  );
  land("microprocessor", rerender);
  expect(input).toHaveValue("microprocessor");
});

test("a search changed from elsewhere still resets the box", () => {
  navigation.params = new URLSearchParams({ q: "micro" });
  const { rerender } = render(<Bar />);
  const input = screen.getByRole("searchbox");
  expect(input).toHaveValue("micro");

  land("", rerender);
  expect(input).toHaveValue("");
});
