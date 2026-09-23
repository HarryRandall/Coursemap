"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isLightOnlyPath, themeStorageKey } from "@/lib/theme";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";

/** The root layout applies the initial theme before the page is painted. */
export function AppThemeProvider({
  children,
  authenticated,
}: {
  children: ReactNode;
  authenticated: boolean;
}) {
  const pathname = usePathname();
  return (
    <ThemeProvider
      attribute="class"
      value={{ light: "light", dark: "dark-mode" }}
      forcedTheme={isLightOnlyPath(pathname ?? "/") ? "light" : undefined}
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={themeStorageKey(authenticated)}
      // Keep the library's inline bootstrap inert during client rendering.
      // Its effects still manage theme changes and system preference updates.
      scriptProps={{ type: "text/plain" }}
    >
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  );
}
