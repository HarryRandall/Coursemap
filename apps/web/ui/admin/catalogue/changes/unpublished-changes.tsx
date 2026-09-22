import type { SnapshotChange } from "@/lib/catalogue-import/changes";
import { fieldLabel } from "@/lib/coursemap/catalogue-kinds";
import { FieldChangeList } from "../field-change-list";

/** Saved draft work that sits on top of what is currently published. */
export function UnpublishedChanges({ changes }: { changes: SnapshotChange[] }) {
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
