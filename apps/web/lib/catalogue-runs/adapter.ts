import {
  compactCourseAdapter,
  COMPACT_COURSE_MAX_INPUT_BYTES,
} from "../catalogue-import/kinds/course/compact-adapter.ts";
import {
  compactStructureAdapter,
  COMPACT_STRUCTURE_MAX_INPUT_BYTES,
} from "../catalogue-import/kinds/structure/compact-adapter.ts";
import type { CatalogueSyncAdapter } from "../catalogue-sync/kind-adapter.ts";
import type { BulkImportKind } from "./kinds.ts";

export function bulkImportAdapter(kind: BulkImportKind): CatalogueSyncAdapter {
  return kind === "course" ? compactCourseAdapter : compactStructureAdapter;
}
export function bulkImportInputCap(kind: BulkImportKind) {
  return kind === "course"
    ? COMPACT_COURSE_MAX_INPUT_BYTES
    : COMPACT_STRUCTURE_MAX_INPUT_BYTES;
}
