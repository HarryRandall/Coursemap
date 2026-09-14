import assert from "node:assert/strict";
import { test } from "vitest";
const { compareCatalogueProposal } =
  await import("../lib/coursemap/catalogue-proposal-comparison.ts");

test("proposal review preserves source wording that is the requirement itself", () => {
  const old = {
    unmodelledRequirements: [
      { sourceText: "Permission required", sourceLocator: "#rules" },
    ],
  };
  const next = {
    unmodelledRequirements: [
      { sourceText: "Complete 12 units", sourceLocator: "#rules-v2" },
    ],
  };
  assert.deepEqual(compareCatalogueProposal(old, next), [
    {
      key: "unmodelledRequirements",
      before: [{ sourceText: "Permission required" }],
      after: [{ sourceText: "Complete 12 units" }],
    },
  ]);
  assert.equal(
    compareCatalogueProposal(null, next)[0].after[0].sourceText,
    "Complete 12 units",
  );
});

test("proposal comparison ignores hashes but retains removals and field changes", () => {
  const before = {
    projectionSha256: "old",
    snapshot: { title: "Old", description: "Removed" },
    attributes: [],
  };
  const after = {
    projectionSha256: "new",
    snapshot: { title: "New" },
    attributes: [],
  };
  assert.deepEqual(compareCatalogueProposal(before, after), [
    { key: "title", before: "Old", after: "New" },
    { key: "description", before: "Removed", after: null },
  ]);
});
