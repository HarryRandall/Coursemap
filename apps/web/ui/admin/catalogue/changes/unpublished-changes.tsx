import type { SnapshotChange } from "@/lib/catalogue-import/changes";
import { fieldLabel } from "@/lib/coursemap/catalogue-kinds";
import { FieldChangeList } from "../field-change-list";

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
    <FieldChangeList
      changes={changes.map((change) => ({
        fieldPath: change.fieldPath,
        label: fieldLabel(change.fieldPath),
        oldValue: change.oldValue,
        newValue: change.newValue,
      }))}
    />
  );
}
