import {
  FileClock,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  TriangleAlert,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import {
  type ChangelogEntryView,
  editingSessionSummary,
} from "@/lib/catalogue/changelog";
import { FieldChangeList } from "../field-change-list";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", { timeStyle: "short" }).format(
    new Date(value),
  );
}

function EntryIcon({ kind }: { kind: ChangelogEntryView["kind"] }) {
  const shared = {
    className: "mt-0.5 size-4 shrink-0 text-muted-foreground",
    "aria-hidden": true,
  } as const;
  if (kind === "publish") return <Send {...shared} />;
  if (kind === "unpublish") return <Undo2 {...shared} />;
  if (kind === "edit") return <Pencil {...shared} />;
  if (kind === "discard") return <Trash2 {...shared} />;
  if (kind === "restore") return <RotateCcw {...shared} />;
  if (kind === "sync_failed") return <TriangleAlert {...shared} />;
  if (kind === "source_checked" || kind === "source_changed")
    return <RefreshCw {...shared} />;
  return <FileClock {...shared} />;
}

function editTitle(entry: ChangelogEntryView, actor: string) {
  if (entry.fields.length === 1)
    return `${actor} edited ${entry.fields[0]!.label}`;
  if (entry.fields.length === 0) return `${actor} edited the draft`;
  return `${actor} edited ${entry.fields.length} fields`;
}

function entryTitle(entry: ChangelogEntryView) {
  const actor = entry.actorName ?? "Someone";
  const version = entry.versionOrdinal
    ? `version ${entry.versionOrdinal}`
    : "a version";
  switch (entry.kind) {
    case "edit":
      return editTitle(entry, actor);
    case "publish":
      return `Published ${version}`;
    case "unpublish":
      return "Unpublished";
    case "discard":
      return "Draft discarded";
    case "restore":
      return `Restored ${version} as a draft`;
    case "source_draft_created":
      return "ANU content started the draft";
    case "source_checked":
      return "Checked ANU";
    case "source_changed":
      return "ANU changes found";
    case "sync_failed":
      return "ANU sync failed";
    default:
      return "ANU changes reviewed";
  }
}

function entryDetail(entry: ChangelogEntryView) {
  if (entry.kind === "edit") return editingSessionSummary(entry);
  if (entry.kind === "source_checked") {
    return entry.eventIds.length > 1
      ? `Checked ${entry.eventIds.length} times. No changes found.`
      : "No changes found.";
  }
  if (entry.kind === "source_changed" && entry.sourceChanges) {
    const { total, conflicts } = entry.sourceChanges;
    const changes = `${total} change${total === 1 ? "" : "s"} to review`;
    return conflicts > 0
      ? `${changes}, ${conflicts} conflict${conflicts === 1 ? "" : "s"}`
      : changes;
  }
  if (entry.kind === "discard")
    return entry.versionOrdinal
      ? `Kept as version ${entry.versionOrdinal}, which can be restored.`
      : null;
  return null;
}

/**
 * One thing that happened, in the vocabulary an administrator works in. The
 * raw events behind an entry stay in the database; this names what they add up
 * to.
 */
export function ChangelogEntry({
  entry,
  versionHref,
}: {
  entry: ChangelogEntryView;
  versionHref: string | null;
}) {
  const detail = entryDetail(entry);
  const actor =
    entry.kind === "edit"
      ? null
      : (entry.actorName ?? (entry.origin === "source" ? "ANU sync" : null));
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-card p-4">
      <EntryIcon kind={entry.kind} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-sm font-semibold">{entryTitle(entry)}</h3>
          <time className="text-xs text-muted-foreground" dateTime={entry.at}>
            {formatTime(entry.at)}
          </time>
        </div>
        {actor ? (
          <p className="text-xs text-muted-foreground">{actor}</p>
        ) : null}
        {detail ? (
          <p className="text-sm text-muted-foreground">{detail}</p>
        ) : null}
        {entry.usedFromSource.length > 0 ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Used ANU: </span>
            {entry.usedFromSource.join(", ")}
          </p>
        ) : null}
        {entry.keptLocal.length > 0 ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Kept current: </span>
            {entry.keptLocal.join(", ")}
          </p>
        ) : null}
        {entry.fields.length > 0 ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline">
              {entry.fields.length === 1
                ? "View change"
                : `View ${entry.fields.length} changes`}
            </summary>
            <div className="mt-2">
              <FieldChangeList changes={entry.fields} bordered={false} />
            </div>
          </details>
        ) : null}
        {versionHref ? (
          <Link
            className="mt-1 text-sm font-medium underline-offset-4 hover:underline"
            href={versionHref}
          >
            View version {entry.versionOrdinal}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
