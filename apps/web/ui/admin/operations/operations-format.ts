/** Shared formatting for the operations tables, where precision matters. */
export function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

export function formatCost(costUsd: number) {
  if (costUsd === 0) return "—";
  return costUsd < 0.01
    ? `US$${costUsd.toFixed(4)}`
    : `US$${costUsd.toFixed(2)}`;
}

export function formatTimestamp(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatBytes(byteSize: number | null) {
  if (byteSize === null) return "—";
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} kB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

const SYNC_STATUS_TONES = {
  queued: "neutral",
  running: "info",
  unchanged: "success",
  review_required: "warning",
  applied: "success",
  failed: "danger",
  cancelled: "neutral",
} as const;

export type SyncStatusTone =
  (typeof SYNC_STATUS_TONES)[keyof typeof SYNC_STATUS_TONES];

export function syncStatusTone(status: string): SyncStatusTone {
  return (
    SYNC_STATUS_TONES[status as keyof typeof SYNC_STATUS_TONES] ?? "neutral"
  );
}

/** Technical statuses belong in operations, so they are shown as they are. */
export function syncStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}
