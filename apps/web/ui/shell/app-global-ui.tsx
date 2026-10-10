"use client";

import { useEffect, type CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster } from "@coursemap/ui/primitives/sonner";
import { useInputModality } from "@/lib/browser/use-input-modality";
import { GuestPlanTransfer } from "@/ui/shell/guest-plan-transfer";

export function AppGlobalUi({
  authenticated,
  guest,
  guestPlanToTransfer,
}: {
  authenticated: boolean;
  guest: boolean;
  guestPlanToTransfer: boolean;
}) {
  useInputModality();
  // The vendored Toaster reads the stored theme, which ignores a forced one.
  const { forcedTheme, resolvedTheme } = useTheme();
  const toastTheme = forcedTheme ?? resolvedTheme;
  useEffect(() => {
    if (!authenticated && !guest) return;
    const refreshRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", refreshRestoredPage);
    return () => window.removeEventListener("pageshow", refreshRestoredPage);
  }, [authenticated, guest]);

  return (
    <>
      {guestPlanToTransfer ? <GuestPlanTransfer /> : null}
      <Toaster
        theme={
          toastTheme === "dark" || toastTheme === "light"
            ? toastTheme
            : "system"
        }
        position="top-center"
        style={{ "--width": "420px" } as CSSProperties}
        closeButton
        visibleToasts={3}
      />
    </>
  );
}
