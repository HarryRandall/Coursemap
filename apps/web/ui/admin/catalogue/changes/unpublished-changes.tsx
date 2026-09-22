import type { SnapshotChange } from "@/lib/catalogue-import/changes";
import { fieldLabel } from "@/lib/coursemap/catalogue-kinds";

function describe(value: unknown) {
  if (value === null || value === undefined) return "Not set";
  if (Array.isArray(value))
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "A value";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).trim();
  if (text === "") return "Not set";
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/** Saved draft work that students will not see until the record is published. */
export function UnpublishedChanges({
  changes,
  isPublished,
}: {
  changes: SnapshotChange[];
  isPublished: boolean;
}) {
  if (!isPublished) {
    return (
      <p className="text-sm text-muted-foreground">
        This record has never been published, so nothing in the draft is visible
        to students yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {changes.map((change) => (
        <li
          className="rounded-xl border border-border bg-card p-4"
          key={change.fieldPath}
        >
          <p className="font-medium">{fieldLabel(change.fieldPath)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="break-words">{describe(change.oldValue)}</span>
            <span aria-hidden="true"> → </span>
            <span className="sr-only">becomes</span>
            <span className="break-words text-foreground">
              {describe(change.newValue)}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}
