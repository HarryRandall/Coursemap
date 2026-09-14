import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

const actionsPath = new URL(
  "../lib/coursemap/academic-structure-import-review-actions.ts",
  import.meta.url,
);
const publicationActionsPath = new URL(
  "../lib/coursemap/catalogue-publication-actions.ts",
  import.meta.url,
);

const loaderPath = new URL(
  "../lib/coursemap/admin-academic-structure-imports.ts",
  import.meta.url,
);
const artifactRoutePath = new URL(
  "../app/api/admin/academic-structure-imports/artifacts/[artifactId]/route.ts",
  import.meta.url,
);

test("reviews through the target RPC and only accepts explicit decisions", async () => {
  const source = await readFile(actionsPath, "utf8");
  assert.match(source, /review_academic_structure_import_target/);
  assert.match(source, /decision: "accepted" \| "rejected"/);
  assert.match(source, /return decide\("accepted", input\)/);
  assert.match(source, /return decide\("rejected", input\)/);
  assert.doesNotMatch(source, /auto.?accept/iu);
});

test("publication is owned by the catalogue workspace", async () => {
  const [importAction, publicationAction] = await Promise.all([
    readFile(actionsPath, "utf8"),
    readFile(publicationActionsPath, "utf8"),
  ]);
  assert.doesNotMatch(
    importAction,
    /publishAcademicStructureDraft|publish_academic_structure_snapshot/,
  );
  assert.match(publicationAction, /publish_academic_structure_snapshot/);
  assert.match(publicationAction, /canWriteCatalogue\(\)/);
  assert.match(publicationAction, /p_structure_year_id: structureYearId/);
  assert.match(publicationAction, /p_snapshot_id: snapshotId/);
});

test("loads the full candidate snapshot-native projection", async () => {
  const source = await readFile(loaderPath, "utf8");
  for (const table of [
    "academic_structure_snapshot_sections",
    "academic_structure_summary_fields",
    "academic_structure_learning_outcomes",
    "academic_structure_fees",
    "academic_structure_snapshot_relationships",
    "academic_structure_requirement_groups",
    "academic_structure_requirement_conditions",
    "academic_structure_requirement_options",
    "academic_structure_unmodelled_requirements",
    "academic_structure_snapshot_evidence",
    "academic_structure_review_items",
  ]) {
    assert.match(source, new RegExp(table));
  }
  assert.match(source, /runNumber: runMetadata\.run_number/);
});

test("serves verified private artefacts as inert text", async () => {
  const source = await readFile(artifactRoutePath, "utf8");
  assert.match(source, /academic_structure_import_artifacts/);
  assert.match(source, /readCourseImportArtifact/);
  assert.match(source, /COURSE_IMPORT_ARTIFACT_BUCKET/);
  assert.match(source, /default-src 'none'; sandbox/);
  assert.match(source, /text\/plain; charset=utf-8/);
  assert.match(source, /nosniff/);
});
