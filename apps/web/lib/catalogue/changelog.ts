import { fieldLabel } from "../coursemap/catalogue-kinds.ts";

export type ChangelogEventKind =
  | "edit"
  | "publish"
  | "unpublish"
  | "discard"
  | "restore"
  | "source_draft_created"
  | "source_checked"
  | "source_changed"
  | "sync_failed"
  | "source_accepted"
  | "source_kept";

export type ChangelogEvent = {
  id: number;
  eventKind: ChangelogEventKind;
  origin: "manual" | "source";
  actorId: string | null;
  editingSessionId: string | null;
  versionId: number | null;
  syncChangeId: number | null;
  createdAt: string;
  fields: Array<{ fieldPath: string; oldValue: unknown; newValue: unknown }>;
  /** The review row a source decision answered, when the event has one. */
  decision: { fieldPath: string; decision: "use_source" | "keep_local" } | null;
};

export type ChangelogFieldChange = {
  fieldPath: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
};

export type ChangelogEntry = {
  id: string;
  kind: ChangelogEventKind;
  at: string;
  startedAt: string;
  actorId: string | null;
  origin: "manual" | "source";
  eventIds: number[];
  versionId: number | null;
  fields: ChangelogFieldChange[];
  usedFromSource: string[];
  keptLocal: string[];
};

/** Decisions taken in one sitting read as one review, not as five rows. */
const DECISION_WINDOW_MS = 30 * 60 * 1000;

function sameEditingSession(left: ChangelogEvent, right: ChangelogEvent) {
  return (
    left.eventKind === "edit" &&
    right.eventKind === "edit" &&
    left.editingSessionId !== null &&
    left.editingSessionId === right.editingSessionId &&
    left.actorId === right.actorId
  );
}

function sameDecisionSitting(left: ChangelogEvent, right: ChangelogEvent) {
  const decisions = new Set(["source_accepted", "source_kept"]);
  return (
    decisions.has(left.eventKind) &&
    decisions.has(right.eventKind) &&
    left.actorId === right.actorId &&
    Math.abs(Date.parse(left.createdAt) - Date.parse(right.createdAt)) <=
      DECISION_WINDOW_MS
  );
}

function sameQuietCheck(left: ChangelogEvent, right: ChangelogEvent) {
  return (
    left.eventKind === "source_checked" && right.eventKind === "source_checked"
  );
}

function belongsToGroup(group: ChangelogEvent[], event: ChangelogEvent) {
  const last = group[group.length - 1]!;
  return (
    sameEditingSession(last, event) ||
    sameDecisionSitting(last, event) ||
    sameQuietCheck(last, event)
  );
}

/**
 * Collapses one group of raw events into the field changes a reader cares
 * about: the value before the session started against the value it ended on,
 * with paths that came back to where they started dropped entirely.
 */
function mergedFields(events: ChangelogEvent[]): ChangelogFieldChange[] {
  const oldest = new Map<string, unknown>();
  const newest = new Map<string, unknown>();
  const order: string[] = [];
  // Events arrive newest first, so the last one seen for a path is the oldest.
  for (const event of events) {
    for (const change of event.fields) {
      if (!newest.has(change.fieldPath)) {
        newest.set(change.fieldPath, change.newValue);
        order.push(change.fieldPath);
      }
      oldest.set(change.fieldPath, change.oldValue);
    }
  }
  return order.flatMap((fieldPath) => {
    const oldValue = oldest.get(fieldPath) ?? null;
    const newValue = newest.get(fieldPath) ?? null;
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null))
      return [];
    return [{ fieldPath, label: fieldLabel(fieldPath), oldValue, newValue }];
  });
}

/**
 * One human timeline from raw audit events, newest first. Grouping is
 * presentation only: every event keeps its own row in the database, and an
 * entry names the events it covers so the raw history stays reachable.
 */
export function groupChangelogEvents(
  events: readonly ChangelogEvent[],
): ChangelogEntry[] {
  const groups: ChangelogEvent[][] = [];
  for (const event of events) {
    const current = groups[groups.length - 1];
    if (current && belongsToGroup(current, event)) current.push(event);
    else groups.push([event]);
  }

  return groups.map((group) => {
    const newest = group[0]!;
    const oldest = group[group.length - 1]!;
    const decisions = group.flatMap((event) =>
      event.decision ? [event.decision] : [],
    );
    return {
      id: `event-${newest.id}`,
      kind: newest.eventKind,
      at: newest.createdAt,
      startedAt: oldest.createdAt,
      actorId: newest.actorId,
      origin: newest.origin,
      eventIds: group.map((event) => event.id),
      versionId: newest.versionId,
      fields: mergedFields(group),
      usedFromSource: decisions
        .filter((entry) => entry.decision === "use_source")
        .map((entry) => fieldLabel(entry.fieldPath)),
      keptLocal: decisions
        .filter((entry) => entry.decision === "keep_local")
        .map((entry) => fieldLabel(entry.fieldPath)),
    } satisfies ChangelogEntry;
  });
}

export const CHANGELOG_PAGE_SIZE = 40;

export type ChangelogEntryView = ChangelogEntry & {
  actorName: string | null;
  versionOrdinal: number | null;
  /** Review totals for the sync that produced a source change entry. */
  sourceChanges: { total: number; conflicts: number } | null;
};

export type CatalogueChangelog = {
  entries: ChangelogEntryView[];
  shown: number;
  hasMore: boolean;
};

/** "5 autosaves over 4 minutes", or null when there is nothing to summarise. */
export function editingSessionSummary(entry: ChangelogEntry) {
  if (entry.kind !== "edit" || entry.eventIds.length < 2) return null;
  const minutes = Math.round(
    (Date.parse(entry.at) - Date.parse(entry.startedAt)) / 60_000,
  );
  const saves = `${entry.eventIds.length} autosaves`;
  if (minutes < 1) return `${saves} in under a minute`;
  return `${saves} over ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
