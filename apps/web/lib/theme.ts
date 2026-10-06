export const THEME_STORAGE_KEY = "coursemap.theme";

/**
 * Signed-out visitors read a key the theme menu never writes, so they follow
 * the operating system instead of the last account's choice on a shared
 * browser. The logout route also clears site storage.
 */
const SIGNED_OUT_THEME_STORAGE_KEY = "coursemap.theme.signed-out";

export function themeStorageKey(authenticated: boolean) {
  return authenticated ? THEME_STORAGE_KEY : SIGNED_OUT_THEME_STORAGE_KEY;
}

export function themeInitialisationScript(authenticated: boolean) {
  return `(() => {
    let theme = "system";
    try { theme = localStorage.getItem(${JSON.stringify(themeStorageKey(authenticated))}) || "system"; } catch {}
    const dark = (theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches));
    const root = document.documentElement;
    root.classList.remove("light", "dark-mode");
    root.classList.add(dark ? "dark-mode" : "light");
    root.style.colorScheme = dark ? "dark" : "light";
  })();`;
}
