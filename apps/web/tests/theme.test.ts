import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import {
  THEME_STORAGE_KEY,
  themeInitialisationScript,
  themeStorageKey,
} from "../lib/theme";

function renderTheme(
  pathname: string,
  authenticated: boolean,
  { stored, systemDark }: { stored?: string; systemDark: boolean },
) {
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
    localStorage: {
      getItem: (key: string) =>
        key === THEME_STORAGE_KEY ? (stored ?? null) : null,
    },
    matchMedia: () => ({ matches: systemDark }),
    document: { documentElement: root },
  });
  return root.style.colorScheme;
}

test("signed-out visitors follow the system and ignore a saved choice", () => {
  expect(themeStorageKey(false)).not.toBe(THEME_STORAGE_KEY);
  expect(renderTheme("/login", false, { systemDark: true })).toBe("dark");
  expect(
    renderTheme("/courses", false, { stored: "light", systemDark: true }),
  ).toBe("dark");
  expect(
    renderTheme("/signup", false, { stored: "dark", systemDark: false }),
  ).toBe("light");
  expect(renderTheme("/", false, { systemDark: true })).toBe("dark");
});

test("signed-in people keep their saved choice on every route", () => {
  expect(themeStorageKey(true)).toBe(THEME_STORAGE_KEY);
  expect(
    renderTheme("/onboarding", true, { stored: "dark", systemDark: false }),
  ).toBe("dark");
  expect(
    renderTheme("/dashboard", true, { stored: "light", systemDark: true }),
  ).toBe("light");
  expect(renderTheme("/plan", true, { systemDark: true })).toBe("dark");
  expect(renderTheme("/", true, { stored: "dark", systemDark: false })).toBe(
    "dark",
  );
});

test("an unreadable store falls back to the system theme", () => {
  const root = {
    classList: { remove: () => {}, add: () => {} },
    style: { colorScheme: "" },
  };
  runInNewContext(themeInitialisationScript(true), {
    location: { pathname: "/plan" },
    localStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
    },
    matchMedia: () => ({ matches: true }),
    document: { documentElement: root },
  });
  expect(root.style.colorScheme).toBe("dark");
});
