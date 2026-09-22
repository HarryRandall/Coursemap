import { Badge } from "@coursemap/ui/components/badge";
import { CircleX, LoaderCircle, TriangleAlert } from "lucide-react";

import {
  type CatalogueDirectoryRecord,
  catalogueRecordState,
} from "@/lib/coursemap/catalogue-kinds";

/**
 * One record, one state. A directory holds thousands of rows that are all in
 * the same resting state, so splitting publication, listing and sync across
 * three columns printed the same three words on every line and left the
 * exceptions looking like everything else. This reports the single fact worth
 * acting on, chosen by the shared cascade the State filter narrows by.
 *
 * Draft means someone has opened the record to work on it and not published
 * what they did. Reading a record opens nothing, so browsing the catalogue
 * leaves every badge alone.
 *
 * The exceptions carry an icon; the resting states stay quiet, so a page of
 * untouched records reads as calm and anything that needs a person stands out.
 */
export function CatalogueStateBadge({
  record,
}: {
  record: CatalogueDirectoryRecord;
}) {
  switch (catalogueRecordState(record)) {
    case "sync_failed":
      return (
        <Badge variant="destructive-light">
          <CircleX aria-hidden="true" />
          Sync failed
        </Badge>
      );
    case "delisted":
      return (
        <Badge variant="warning-light">
          <TriangleAlert aria-hidden="true" />
          No longer listed
        </Badge>
      );
    case "syncing":
      return (
        <Badge variant="secondary">
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          Syncing
        </Badge>
      );
    case "changes_available":
      return (
        <Badge variant="warning-light">
          <TriangleAlert aria-hidden="true" />
          {record.conflictCount > 0
            ? `${record.openChangeCount} ANU change${record.openChangeCount === 1 ? "" : "s"}, ${record.conflictCount} conflict${record.conflictCount === 1 ? "" : "s"}`
            : `${record.openChangeCount} ANU change${record.openChangeCount === 1 ? "" : "s"}`}
        </Badge>
      );
    case "draft":
      return <Badge variant="primary-light">Draft</Badge>;
    case "published":
      return <Badge variant="success-light">Published</Badge>;
    default:
      return <Badge variant="outline">Not published</Badge>;
  }
}
