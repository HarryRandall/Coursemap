export const THEME_STORAGE_KEY = "coursemap.theme";

/**
 * Signed-out visitors read a key the theme menu never writes, so they follow
 * the operating system instead of the last account's choice on a shared
 * browser. The logout route also clears site storage.
 */
const SIGNED_OUT_THEME_STORAGE_KEY = "coursemap.theme.signed-out";

/**
 * The landing page has no dark design yet. Remove it from this list once it
 * does; every other route follows the saved or system theme.
 */
const LIGHT_ONLY_PATHS: readonly string[] = ["/"];

export function isLightOnlyPath(pathname: string) {
  return LIGHT_ONLY_PATHS.includes(pathname);
}

export function themeStorageKey(authenticated: boolean) {
  return authenticated ? THEME_STORAGE_KEY : SIGNED_OUT_THEME_STORAGE_KEY;
}

export function themeInitialisationScript(authenticated: boolean) {
  return `(() => {
    const lightOnly = ${JSON.stringify(LIGHT_ONLY_PATHS)}.includes(location.pathname);
    let theme = "system";
    try { theme = localStorage.getItem(${JSON.stringify(themeStorageKey(authenticated))}) || "system"; } catch {}
    const dark = !lightOnly && (theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches));
    const root = document.documentElement;
    root.classList.remove("light", "dark-mode");
    root.classList.add(dark ? "dark-mode" : "light");
    root.style.colorScheme = dark ? "dark" : "light";
  })();`;
}
