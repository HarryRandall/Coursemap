import { Badge } from "@coursemap/ui/components/badge";
import { CircleX, LoaderCircle, TriangleAlert } from "lucide-react";

import type { CatalogueDirectoryRecord } from "@/lib/coursemap/catalogue-kinds";

/**
 * One record, one state. A directory holds thousands of rows that are all in
 * the same resting state, so splitting publication, listing and sync across
 * three columns printed the same three words on every line and left the
 * exceptions looking like everything else. This reports the single fact worth
 * acting on, most urgent first: a broken sync before a delisting, a delisting
 * before waiting changes, and only then how far the record has been taken.
 *
 * Draft means someone has changed something and not published it. Opening a
 * record is not a change, so reading the catalogue leaves every badge alone.
 *
 * The exceptions carry an icon; the resting states stay quiet, so a page of
 * untouched records reads as calm and anything that needs a person stands out.
 */
export function CatalogueStateBadge({
  record,
}: {
  record: CatalogueDirectoryRecord;
}) {
  if (record.sourceState === "sync_failed")
    return (
      <Badge variant="destructive-light">
        <CircleX aria-hidden="true" />
        Sync failed
      </Badge>
    );

  if (record.isListedByAnu === false)
    return (
      <Badge variant="warning-light">
        <TriangleAlert aria-hidden="true" />
        No longer listed
      </Badge>
    );

  if (record.sourceState === "syncing")
    return (
      <Badge variant="secondary">
        <LoaderCircle aria-hidden="true" className="animate-spin" />
        Syncing
      </Badge>
    );

  if (record.sourceState === "changes_available" && record.openChangeCount > 0)
    return (
      <Badge variant="warning-light">
        <TriangleAlert aria-hidden="true" />
        {record.conflictCount > 0
          ? `${record.openChangeCount} ANU change${record.openChangeCount === 1 ? "" : "s"}, ${record.conflictCount} conflict${record.conflictCount === 1 ? "" : "s"}`
          : `${record.openChangeCount} ANU change${record.openChangeCount === 1 ? "" : "s"}`}
      </Badge>
    );

  // Unsaved work outranks publication here. A published record with a draft
  // is the one a person still has to come back to, and the directory is the
  // list they come back through.
  if (record.hasDraft) return <Badge variant="primary-light">Draft</Badge>;
  if (record.isPublished)
    return <Badge variant="success-light">Published</Badge>;
  return <Badge variant="outline">Not published</Badge>;
}
