"use client";

import { Button } from "@coursemap/ui/primitives/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErrorPageLayout } from "@/ui/common/error-page-layout";
import { useOnlineStatus } from "@/lib/browser/use-online-status";
import { OfflineError } from "@/ui/errors/offline-error";
import { ErrorState } from "@/ui/common/error-state";
import { AppShell } from "@/ui/shell";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const online = useOnlineStatus();
  const pathname = usePathname();
  if (!online) return <OfflineError retry={reset} />;

  const admin = pathname.startsWith("/admin");
  const state = (
    <ErrorState
      code={error.digest ? "500 · Server error" : "Page error"}
      title="We couldn't load this page"
      description="Something went wrong on our side. Try again, or head home and come back later."
      reference={error.digest}
    >
      <Button onClick={reset} type="button">
        Try again
      </Button>
      <Button asChild variant="outline">
        <Link href={admin ? "/admin/dashboard" : "/dashboard"}>
          {admin ? "Back to overview" : "Back to home"}
        </Link>
      </Button>
    </ErrorState>
  );

  return admin ? (
    <AppShell admin fill>
      {state}
    </AppShell>
  ) : (
    <ErrorPageLayout>{state}</ErrorPageLayout>
  );
}
