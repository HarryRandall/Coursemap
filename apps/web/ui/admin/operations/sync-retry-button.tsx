"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { CatalogueKind } from "@/lib/catalogue/content";
import { adminCatalogueSyncPath } from "@/lib/coursemap/catalogue-kinds";

/**
 * Runs the record's sync again and opens the new run, since this page reads
 * one sync and would otherwise keep showing the failure it was opened for.
 */
export function SyncRetryButton({
  recordId,
  kind,
  code,
}: {
  recordId: number;
  kind: CatalogueKind;
  code: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const retry = () =>
    startTransition(async () => {
      const response = await fetch("/api/admin/catalogue-syncs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordId, kind }),
      });
      const result = (await response.json()) as {
        error?: string;
        syncId?: string;
      };
      if (!response.ok || !result.syncId) {
        toast.error(`Couldn't start the ${code} sync`, {
          description: result.error ?? "The server did not return a sync.",
        });
        return;
      }
      router.push(adminCatalogueSyncPath(result.syncId));
    });
  return (
    <Button
      size="sm"
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={retry}
    >
      {isPending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      Retry sync
    </Button>
  );
}
