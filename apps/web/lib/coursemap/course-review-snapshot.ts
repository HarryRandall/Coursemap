/** Pending imports can be inspected before acceptance without becoming the draft. */
export function courseReviewSnapshotId({
  requestedSnapshotId,
  activeSnapshotId,
  availableSnapshotIds,
  pendingSnapshotIds,
}: {
  requestedSnapshotId?: number;
  activeSnapshotId: number | null;
  availableSnapshotIds: number[];
  pendingSnapshotIds: number[];
}) {
  const available = new Set(availableSnapshotIds);
  if (requestedSnapshotId !== undefined && available.has(requestedSnapshotId))
    return requestedSnapshotId;
  return (
    activeSnapshotId ??
    pendingSnapshotIds.find((id) => available.has(id)) ??
    null
  );
}
