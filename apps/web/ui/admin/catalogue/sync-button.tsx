"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { CatalogueKind } from "@/lib/catalogue/content";
import type { CatalogueSync } from "@/lib/coursemap/admin-catalogue-record";

export function CatalogueSyncButton({
  recordId,
  kind,
  latestSync,
}: {
  recordId: number;
  kind: CatalogueKind;
  latestSync: CatalogueSync | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [startedSyncId, setStartedSyncId] = useState<string | null>(null);
  const awaitingStartedSync =
    startedSyncId !== null && latestSync?.id !== startedSyncId;
  const isActive =
    awaitingStartedSync ||
    latestSync?.status === "queued" ||
    latestSync?.status === "running";

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => router.refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [isActive, router]);

  function startSync() {
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
      if (!response.ok) {
        toast.error(result.error ?? "The ANU sync could not start.");
        return;
      }
      if (!result.syncId) {
        toast.error("The ANU sync did not return an identifier.");
        return;
      }
      setStartedSyncId(result.syncId);
      toast.success("Syncing from ANU...");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={startSync}
      disabled={isPending || isActive}
    >
      <RefreshCw
        className={isActive ? "animate-spin" : undefined}
        aria-hidden="true"
      />
      {isActive
        ? "Syncing from ANU..."
        : latestSync?.status === "failed"
          ? "Retry sync"
          : "Sync from ANU"}
    </Button>
  );
}
