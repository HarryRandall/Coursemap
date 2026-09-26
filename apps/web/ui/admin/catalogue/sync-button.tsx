"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CatalogueKind } from "@/lib/catalogue/content";
import type { CatalogueSync } from "@/lib/coursemap/admin-catalogue-record";
import { startTask, type TaskHandle } from "@/ui/common/task-toast";

/**
 * A record sync is queued and worked on elsewhere, so each status owns a
 * stretch of the bar: where the sync has reached, and where that status ends.
 * The bar drifts across its stretch while the status holds, so a sync picked
 * up instantly still reads as movement rather than a jump.
 */
const SYNC_PROGRESS: Record<
  string,
  { percent: number; ceiling: number; detail: string }
> = {
  queued: { percent: 12, ceiling: 45, detail: "Waiting for a worker." },
  running: { percent: 50, ceiling: 88, detail: "Reading the ANU page." },
};

const SYNC_OUTCOMES = {
  applied: {
    title: "ANU changes applied",
    detail: "The record is up to date.",
  },
  review_required: {
    title: "ANU changes need review",
    detail: "Open the changes to accept or reject them.",
  },
  unchanged: {
    title: "No ANU changes",
    detail: "ANU has not changed this record since the last sync.",
  },
} as const;

export type CatalogueSyncTarget = {
  recordId: number;
  code: string;
  kind: CatalogueKind;
  latestSync: CatalogueSync | null;
  /** Whether ANU has ever been read for this record, which names the action. */
  hasSynced: boolean;
};

/**
 * Starts a record's ANU sync and follows it to the end with a toast. Whatever
 * control starts it shows `busy` while it runs and names itself `label`.
 */
export function useCatalogueSync({
  recordId,
  code,
  kind,
  latestSync,
  hasSynced,
}: CatalogueSyncTarget) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [startedSyncId, setStartedSyncId] = useState<string | null>(null);
  const task = useRef<TaskHandle | null>(null);
  const reportedStatus = useRef<string | null>(null);
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

  // The retry offered by a failed sync restarts this same handler, so it is
  // reached through a ref rather than the handler referring to itself.
  const startSyncRef = useRef<() => void>(undefined);
  const retrySync = useCallback(() => startSyncRef.current?.(), []);

  const startSync = useCallback(() => {
    reportedStatus.current = null;
    task.current = startTask({
      id: `sync:${recordId}`,
      title: `Syncing ${code} from ANU`,
      detail: "Asking ANU for the latest version.",
      ceiling: 12,
    });
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
        task.current?.fail({
          title: `Syncing ${code} from ANU could not start`,
          detail: result.error ?? "The sync did not return an identifier.",
          retry: retrySync,
        });
        task.current = null;
        return;
      }
      task.current?.step(SYNC_PROGRESS.queued);
      setStartedSyncId(result.syncId);
      router.refresh();
    });
  }, [code, kind, recordId, retrySync, router]);

  useEffect(() => {
    startSyncRef.current = startSync;
  }, [startSync]);

  // The sync runs on the server and this button is the only thing watching it.
  // Leaving the page stops the poll, so the toast is handed back rather than
  // left spinning at whatever percentage it had reached.
  useEffect(
    () => () =>
      task.current?.abandon({
        title: "The ANU sync is still running",
        detail: "Open the record again to see how it finished.",
      }),
    [],
  );

  // Only a sync started from this button owns a toast; a scheduled one running
  // in the background should not interrupt whoever opened the page.
  useEffect(() => {
    if (!startedSyncId || latestSync?.id !== startedSyncId) return;
    const status = latestSync.status;
    if (status === reportedStatus.current) return;
    reportedStatus.current = status;
    const running = SYNC_PROGRESS[status];
    if (running) {
      task.current?.step(running);
      return;
    }
    if (status === "failed") {
      task.current?.fail({
        title: `Syncing ${code} from ANU failed`,
        detail: latestSync.errorMessage ?? "The sync did not finish.",
        retry: retrySync,
      });
    } else if (status === "cancelled") {
      task.current?.note({
        title: `Syncing ${code} from ANU was cancelled`,
      });
    } else {
      const outcome = SYNC_OUTCOMES[status as keyof typeof SYNC_OUTCOMES];
      task.current?.done({
        title: outcome?.title ?? `${code} synced from ANU`,
        detail: outcome?.detail,
      });
    }
    task.current = null;
  }, [code, latestSync, retrySync, startedSyncId]);

  // A sync whose worker went away, such as a dev server that restarted
  // mid-read, never finishes on its own, so an active one can be stopped.
  const cancel = useCallback(() => {
    const syncId = latestSync?.id ?? startedSyncId;
    if (!syncId) return;
    startTransition(async () => {
      const response = await fetch("/api/admin/catalogue-syncs", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ syncId }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        task.current?.fail({
          title: `Stopping the ${code} sync failed`,
          detail: result.error ?? "The sync could not be stopped.",
        });
        task.current = null;
      }
      setStartedSyncId(null);
      router.refresh();
    });
  }, [code, latestSync?.id, router, startedSyncId]);

  return {
    start: startSync,
    cancel,
    busy: isPending || isActive,
    isActive,
    label:
      latestSync?.status === "failed" && !isActive
        ? "Retry sync"
        : hasSynced
          ? "Resync"
          : "Sync",
  };
}

export function CatalogueSyncButton(target: CatalogueSyncTarget) {
  const sync = useCatalogueSync(target);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={sync.start}
      disabled={sync.busy}
      aria-busy={sync.busy}
    >
      {sync.isActive ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {sync.label}
    </Button>
  );
}
