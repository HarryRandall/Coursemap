import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import {
  EXAMPLE_SOCIETIES,
  EXAMPLE_SOCIETY_EVENTS,
} from "@/tests/fixtures/societies";
import { SocietiesDirectory } from "@/ui/societies/societies-directory";
import { SocietyProfile } from "@/ui/societies/society-profile";

const navigation = vi.hoisted(() => ({
  pathname: "/societies",
  query: "",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
}));

beforeEach(() => {
  navigation.push.mockClear();
});

test("directory tabs update the URL and follow restored history without losing filters", async () => {
  navigation.pathname = "/societies";
  navigation.query = "tab=events&q=chess";
  const view = () => (
    <TooltipProvider>
      <SocietiesDirectory societies={EXAMPLE_SOCIETIES} events={[]} />
    </TooltipProvider>
  );
  const { rerender } = render(view());
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Clubs" }));
  expect(navigation.push).toHaveBeenCalledWith("/societies?q=chess", {
    scroll: false,
  });
  navigation.query = "q=chess";
  rerender(view());
  expect(screen.getByRole("tab", { name: "Clubs" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("searchbox")).toHaveValue("chess");
  navigation.query = "tab=events&q=chess";
  rerender(view());
  expect(screen.getByRole("tab", { name: "Upcoming events" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("club profile tabs have shareable URLs and render the tab from the current URL", async () => {
  navigation.pathname = "/societies/amnesty-school-group";
  navigation.query = "tab=events";
  const view = () => (
    <SocietyProfile society={EXAMPLE_SOCIETIES[0]!} upcoming={[]} past={[]} />
  );
  const { rerender } = render(view());
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Membership" }));
  expect(navigation.push).toHaveBeenCalledWith(
    "/societies/amnesty-school-group?tab=membership",
    { scroll: false },
  );
  navigation.query = "tab=membership";
  rerender(view());
  expect(screen.getByRole("tab", { name: "Membership" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  navigation.query = "tab=events";
  rerender(view());
  expect(
    screen.getByRole("heading", { name: "No events listed" }),
  ).toBeVisible();
});

test("a history change before hydration retains the server render then selects the current tab", async () => {
  navigation.pathname = "/societies";
  navigation.query = "";
  const view = () => (
    <TooltipProvider>
      <SocietiesDirectory
        initialQuery=""
        societies={EXAMPLE_SOCIETIES}
        events={[]}
      />
    </TooltipProvider>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(view());
  document.body.appendChild(container);
  navigation.query = "tab=events";
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(view(), { container, hydrate: true });
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: "Upcoming events" }),
      ).toHaveAttribute("aria-selected", "true"),
    );
    expect(errors).not.toHaveBeenCalled();
  } finally {
    errors.mockRestore();
  }
});

test("upcoming events search titles and organisers and combine category and society filters", () => {
  navigation.pathname = "/societies";
  navigation.query = "tab=events&q=team";
  const view = () => (
    <TooltipProvider>
      <SocietiesDirectory
        societies={EXAMPLE_SOCIETIES}
        events={EXAMPLE_SOCIETY_EVENTS}
      />
    </TooltipProvider>
  );
  const { rerender } = render(view());
  const event = EXAMPLE_SOCIETY_EVENTS[1]!;
  expect(
    screen.getByRole("link", { name: `View ${event.title}` }),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: /German Conversation/ }),
  ).toBeNull();
  navigation.query = `tab=events&society=${event.societySlug}&event-category=${event.category}`;
  rerender(view());
  expect(
    screen.getByRole("link", { name: `View ${event.title}` }),
  ).toBeVisible();
  navigation.query = "tab=events&q=doesnotmatch";
  rerender(view());
  expect(
    screen.getByRole("heading", { name: "No events match" }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Clear search and filters" }),
  ).toHaveAttribute("href", "/societies?tab=events");
});
