"use client";
import { Button } from "@coursemap/ui/primitives/button";

import { useCoursemap } from "@/app/providers";

type Provider = "Google" | "Microsoft";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28A7.21 7.21 0 0 1 4.91 12c0-.79.14-1.56.38-2.28v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  );
}

/**
 * Social providers are not wired up yet: each button announces that the
 * option is coming soon instead of starting an OAuth flow.
 */
export function SocialSignIn({ disabled }: { disabled?: boolean }) {
  const { notify } = useCoursemap();

  const announce = (provider: Provider) => {
    notify(
      `${provider} sign-in is coming soon. Use your email and password for now.`,
      "info",
    );
  };

  return (
    <div className="space-y-2.5">
      <Button
        type="button"
        disabled={disabled}
        onClick={() => announce("Google")}
        className="min-h-11 w-full"
        size="lg"
        variant="outline"
      >
        <GoogleLogo />
        Continue with Google
      </Button>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => announce("Microsoft")}
        className="min-h-11 w-full"
        size="lg"
        variant="outline"
      >
        <MicrosoftLogo />
        Continue with Microsoft
      </Button>
    </div>
  );
}
