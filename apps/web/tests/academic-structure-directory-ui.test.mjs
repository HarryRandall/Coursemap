import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

const { academicStructureDirectoryRecordStatus } =
  await import("../lib/coursemap/admin-academic-structures.ts");
const {
  adminAcademicStructureCollectionPath,
  adminAcademicStructureDetailPath,
} = await import("../lib/coursemap/academic-structure-routes.ts");

function record(overrides = {}) {
  return {
    draftSnapshotId: null,
    publishedSnapshotId: null,
    latestImport: null,
    ...overrides,
  };
}

function latest(overrides = {}) {
  return {
    processingStatus: "succeeded",
    reviewStatus: "not_required",
    changeKind: null,
    ...overrides,
  };
}

test("builds distinct admin collection and detail routes for every structure kind", () => {
  const expected = {
    programme: "/admin/programmes",
    major: "/admin/majors",
    minor: "/admin/minors",
    specialisation: "/admin/specialisations",
  };

  for (const [kind, path] of Object.entries(expected)) {
    assert.equal(adminAcademicStructureCollectionPath(kind), path);
    assert.equal(
      adminAcademicStructureDetailPath({
        kind,
        publicId: "00000000-0000-4000-8000-000000000001",
      }),
      `${path}/00000000-0000-4000-8000-000000000001`,
    );
  }
});

test("derives one clear directory status from processing, review and publication state", () => {
  assert.equal(academicStructureDirectoryRecordStatus(record()), "directory");
  assert.equal(
    academicStructureDirectoryRecordStatus(
      record({ latestImport: latest({ processingStatus: "queued" }) }),
    ),
    "queued",
  );
  assert.equal(
    academicStructureDirectoryRecordStatus(
      record({ latestImport: latest({ processingStatus: "running" }) }),
    ),
    "processing",
  );
  assert.equal(
    academicStructureDirectoryRecordStatus(
      record({ latestImport: latest({ processingStatus: "cancelled" }) }),
    ),
    "failed",
  );
  assert.equal(
    academicStructureDirectoryRecordStatus(
      record({ latestImport: latest({ reviewStatus: "needs_review" }) }),
    ),
    "needs-review",
  );
  assert.equal(
    academicStructureDirectoryRecordStatus(record({ publishedSnapshotId: 12 })),
    "published",
  );
  assert.equal(
    academicStructureDirectoryRecordStatus(
      record({ draftSnapshotId: 12, publishedSnapshotId: 12 }),
    ),
    "published",
  );
  assert.equal(
    academicStructureDirectoryRecordStatus(
      record({ draftSnapshotId: 13, publishedSnapshotId: 12 }),
    ),
    "draft-changes",
  );
  assert.equal(
    academicStructureDirectoryRecordStatus(record({ draftSnapshotId: 13 })),
    "draft",
  );
  assert.equal(
    academicStructureDirectoryRecordStatus(
      record({ latestImport: latest({ changeKind: "unchanged" }) }),
    ),
    "unchanged",
  );
});

test("loader reads only the new structure directory and snapshot-native tables", async () => {
  const source = await readFile(
    new URL("../lib/coursemap/admin-academic-structures.ts", import.meta.url),
    "utf8",
  );

  for (const table of [
    "academic_years",
    "academic_structure_directory_statuses",
    "academic_structure_directory_entries",
    "academic_structure_directory_latest_import_targets",
    "academic_structure_import_runs",
    "academic_structures",
    "academic_structure_years",
  ]) {
    assert.match(source, new RegExp(`from\\(\"${table}\"\\)`, "u"));
  }
  assert.doesNotMatch(source, /from\("catalogue_/u);
  assert.doesNotMatch(source, /from\("academic_structure_versions"\)/u);
  assert.match(source, /runNumber: latestRun\.run_number/u);
  assert.match(source, /academic_structure_directory_latest_import_targets/u);
  assert.doesNotMatch(source, /limit\(5000\)/u);
  assert.match(source, /ACADEMIC_STRUCTURE_IMPORT_YEARS/u);
});
