import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { expect, test, vi } from "vitest";
import RootLayout from "@/app/layout";

vi.mock("geist/font/mono", () => ({ GeistMono: { variable: "mono" } }));
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "sans" } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/viewer", () => ({
  getAuthContext: async () => ({
    viewer: { id: "student" },
    canAccessAdmin: false,
  }),
}));
vi.mock("@/lib/coursemap/state", () => ({
  loadCoursemapState: async () => undefined,
}));
vi.mock("@/lib/supabase/config", () => ({
  getCanonicalSiteOrigin: () => null,
}));
vi.mock("@/app/providers", () => ({
  AppProvider: ({ children }) => children,
}));
vi.mock("@/ui/shell/app-theme-provider", () => ({
  AppThemeProvider: ({ children }) => children,
}));
vi.mock("@/ui/shell/sidebar-preference", () => ({
  SidebarPreferenceProvider: ({ children }) => children,
}));
vi.mock("@/ui/assistant/assistant-provider", () => ({
  AssistantProvider: ({ children }) => children,
}));
vi.mock("@/ui/shell/loading-progress-provider", () => ({
  LoadingProgressProvider: ({ children }) => children,
}));

test.each([
  ["/rooms", "dark", false, "dark"],
  ["/rooms", "light", true, "light"],
  ["/rooms", "system", true, "dark"],
  ["/login", "dark", false, "dark"],
  ["/", "dark", true, "light"],
])(
  "applies %s with %s preference before body content without the Next.js runtime",
  async (path, theme, systemDark, expected) => {
    const html = renderToStaticMarkup(
      await RootLayout({
        children: createElement("main", null, "Page content"),
      }),
    );
    const page = new JSDOM(
      html.replace(
        "<main>",
        "<script>document.documentElement.dataset.bodyTheme = document.documentElement.style.colorScheme;</script><main>",
      ),
      {
        url: `https://coursemap.test${path}`,
        runScripts: "dangerously",
        beforeParse(window) {
          window.localStorage.setItem("coursemap.theme", theme);
          Object.defineProperty(window, "matchMedia", {
            value: () => ({ matches: systemDark }),
          });
        },
      },
    );
    expect(page.window.document.documentElement.dataset.bodyTheme).toBe(
      expected,
    );
    expect(
      page.window.document.documentElement.classList.contains("dark-mode"),
    ).toBe(expected === "dark");
    page.window.close();
  },
);
