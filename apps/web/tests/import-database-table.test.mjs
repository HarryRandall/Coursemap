import assert from "node:assert/strict";
import { test } from "vitest";
test("groups artefact attempts while keeping database projections in their own tab", async () => {
  const { groupImportArtefacts } =
    await import("../ui/admin/imports/import-artefact-data.ts");
  const artifact = (id, kind, attemptNumber) => ({
    id,
    kind,
    attemptNumber,
    mediaType: "application/json",
  });
  const first = artifact("first", "model_response", 1);
  const second = artifact("second", "model_response", 2);
  const html = artifact("html", "raw_html", 1);
  const input = [
    first,
    artifact("projection", "database_projection", 1),
    second,
    html,
  ];
  assert.deepEqual(groupImportArtefacts(input), [
    { kind: "raw_html", attempts: [html] },
    { kind: "model_response", attempts: [second, first] },
  ]);
  assert.deepEqual(
    input.map((entry) => entry.id),
    ["first", "projection", "second", "html"],
  );
});

test("shows extraction comparisons only when both original results were recorded", async () => {
  const { extractionConflict } =
    await import("../lib/coursemap/extraction-conflict.ts");
  const conflict = {
    deterministicValue: null,
    modelValue: false,
    retained: "deterministic",
  };
  assert.strictEqual(extractionConflict(conflict), conflict);
  assert.equal(
    extractionConflict({ deterministicValue: [], retained: "deterministic" }),
    null,
  );
  assert.equal(extractionConflict([{ value: "Critical Thinking" }]), null);
  assert.equal(extractionConflict(null), null);
  assert.equal(extractionConflict({ ...conflict, retained: "unknown" }), null);
});
