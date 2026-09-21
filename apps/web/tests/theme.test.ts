import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { forceLightTheme, themeInitialisationScript } from "../lib/theme";

test("public and signed-out pages stay light without changing authenticated workspace themes", () => {
  for (const path of ["/", "/login", "/signup", "/auth/error"]) {
    expect(forceLightTheme(path, true)).toBe(true);
    expect(forceLightTheme(path, false)).toBe(true);
  }
  expect(forceLightTheme("/courses/2026/comp1100", false)).toBe(true);
  expect(forceLightTheme("/admin", true)).toBe(false);
  expect(forceLightTheme("/dashboard", true)).toBe(false);
});

test("the bootstrap ignores a saved dark preference on login but restores it in the workspace", () => {
  const renderTheme = (pathname: string, authenticated: boolean) => {
    const classes = new Set<string>();
    const root = {
      classList: {
        remove: (...names: string[]) =>
          names.forEach((name) => classes.delete(name)),
        add: (name: string) => classes.add(name),
      },
      style: { colorScheme: "" },
    };
    runInNewContext(themeInitialisationScript(authenticated), {
      location: { pathname },
      localStorage: { getItem: () => "dark" },
      matchMedia: () => ({ matches: true }),
      document: { documentElement: root },
    });
    return { classes, scheme: root.style.colorScheme };
  };
  expect(renderTheme("/login", true).scheme).toBe("light");
  expect(renderTheme("/dashboard", true).scheme).toBe("dark");
  expect(renderTheme("/courses", false).classes.has("dark-mode")).toBe(false);
});
