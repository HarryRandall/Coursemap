import { describe, expect, test } from "vitest";

import {
  buildRetentionPlan,
  confirmRetentionPlan,
  parseRetentionArgs,
  resolveRetentionTarget,
} from "../scripts/catalogue/lib/retention-policy.mjs";
import { applyRetentionPlan } from "../scripts/catalogue/retention.mjs";

const OLD = "2026-01-01T00:00:00.000Z";
const CUTOFF = "2026-07-01T00:00:00.000Z";
const RECENT = "2026-09-01T00:00:00.000Z";
const SYNC = "11111111-1111-4111-8111-111111111111";
const TARGET = "local:54322/postgres";
function fixture() {
  return {
    syncs: [{ id: SYNC, status: "failed", completed_at: OLD }],
    changes: [
      {
        id: "1",
        sync_id: SYNC,
        superseded_at: OLD,
        created_at: OLD,
        resolved_at: OLD,
        decision: "keep_local",
        row_bytes: 100,
      },
    ],
    stages: [
      {
        id: "stage",
        sync_id: SYNC,
        status: "failed",
        completed_at: OLD,
        row_bytes: 80,
      },
    ],
    artifacts: [
      {
        id: "artifact",
        sync_id: SYNC,
        stage_id: "stage",
        created_at: OLD,
        storage_bucket: "course-import-artifacts",
        storage_path: `2026/${SYNC}/source_fetch/raw_html-hash.html`,
        row_bytes: 70,
      },
    ],
    objects: [
      {
        id: "object",
        name: `2026/${SYNC}/source_fetch/raw_html-hash.html`,
        created_at: OLD,
        updated_at: OLD,
        row_bytes: 60,
        payload_bytes: 500,
      },
    ],
    events: [],
    versions: [],
    publications: [],
    records: [],
    provenance: [],
    documents: [],
    pages: [],
    extractions: [],
    runs: [],
    runItems: [],
    drafts: [],
    draftProvenance: [],
    retained: [],
  };
}
function plan(snapshot = fixture(), options = {}) {
  return buildRetentionPlan(snapshot, {
    cutoff: CUTOFF,
    target: TARGET,
    ...options,
  });
}

describe("catalogue retention candidates", () => {
  test("selects only old decided superseded changes and disposable terminal evidence", () => {
    const result = plan();
    expect(result.candidates.changes.map((row) => row.id)).toEqual(["1"]);
    expect(result.candidates.artifacts.map((row) => row.id)).toEqual([
      "artifact",
    ]);
    expect(result.candidates.stages.map((row) => row.id)).toEqual(["stage"]);
    expect(result.candidates.objects.map((row) => row.id)).toEqual(["object"]);
    expect(result.summary.objects).toMatchObject({
      count: 1,
      rowBytes: 60,
      payloadBytes: 500,
    });
  });
  test.each([
    ["current", { superseded_at: null }],
    ["undecided even when superseded", { decision: null, resolved_at: null }],
    ["recently superseded", { superseded_at: RECENT }],
    ["recently resolved", { resolved_at: RECENT }],
    ["cutoff equality", { superseded_at: CUTOFF }],
  ])("keeps %s reviews", (_, change) => {
    const snapshot = fixture();
    Object.assign(snapshot.changes[0], change);
    expect(plan(snapshot).candidates.changes).toHaveLength(0);
  });
  test("keeps audit-linked rows without relying on ON DELETE SET NULL", () => {
    const snapshot = fixture();
    snapshot.events.push({ sync_change_id: "1" });
    expect(plan(snapshot).candidates.changes).toHaveLength(0);
    expect(plan(snapshot).candidates.artifacts).toHaveLength(0);
  });
  test.each(["queued", "running", "paused", "unknown"])(
    "keeps every object and row of %s syncs, including upload-before-row orphans",
    (status) => {
      const snapshot = fixture();
      snapshot.syncs[0].status = status;
      snapshot.artifacts = [];
      expect(plan(snapshot).candidates.objects).toHaveLength(0);
      expect(plan(snapshot).candidates.stages).toHaveLength(0);
      expect(plan(snapshot).candidates.changes).toHaveLength(0);
    },
  );
  test.each(["active", "paused"])(
    "keeps terminal syncs belonging to %s runs even when all items finished",
    (state) => {
      const snapshot = fixture();
      snapshot.runs = [{ id: "run", state }];
      snapshot.runItems = [{ run_id: "run", sync_id: SYNC }];
      expect(plan(snapshot).candidates.artifacts).toHaveLength(0);
      expect(plan(snapshot).candidates.changes).toHaveLength(0);
    },
  );
  test("keeps all version evidence, including historical publications and copied document provenance", () => {
    const snapshot = fixture();
    snapshot.changes = [];
    snapshot.versions = [{ id: "10", sync_id: null, source_document_id: null }];
    snapshot.publications = [{ version_id: "10", unpublished_at: OLD }];
    snapshot.provenance = [{ version_id: "10", source_document_id: "doc" }];
    snapshot.documents = [{ id: "doc" }];
    snapshot.syncs[0].source_document_id = "doc";
    expect(plan(snapshot).candidates.artifacts).toHaveLength(0);
    expect(plan(snapshot).candidates.objects).toHaveLength(0);
  });
  test("keeps extraction responses and their stages, even old invalid or reused extractions", () => {
    const snapshot = fixture();
    snapshot.extractions = [
      {
        id: "extraction",
        response_artifact_id: "artifact",
        validation_status: "valid",
        completed_at: OLD,
      },
    ];
    const result = plan(snapshot);
    expect(result.candidates.artifacts).toHaveLength(0);
    expect(result.candidates.stages).toHaveLength(0);
    expect(result.rejected.artifacts[0].reason).toBe("extraction_reference");
  });
  test.each(["documents", "pages"])(
    "keeps bodies referenced by %s even when the artefact row can go",
    (table) => {
      const snapshot = fixture();
      snapshot[table] = [
        {
          storage_bucket: "course-import-artifacts",
          storage_path: snapshot.objects[0].name,
        },
      ];
      expect(plan(snapshot).candidates.objects).toHaveLength(0);
    },
  );
  test("selects old recognised orphan paths, rejects unknown and recent orphans", () => {
    const snapshot = fixture();
    snapshot.artifacts = [];
    snapshot.objects.push({
      ...snapshot.objects[0],
      id: "unknown",
      name: "legacy/file.json",
    });
    snapshot.objects.push({
      ...snapshot.objects[0],
      id: "recent",
      name: `2026/${SYNC}/model_extract/response.json`,
      updated_at: RECENT,
    });
    expect(plan(snapshot).candidates.objects.map((row) => row.id)).toEqual([
      "object",
    ]);
    expect(plan(snapshot).candidates.objects[0].category).toBe(
      "orphan_objects",
    );
  });
  test("never cascades a stage into a retained or mismatched artefact", () => {
    const snapshot = fixture();
    snapshot.artifacts[0].created_at = RECENT;
    expect(plan(snapshot).candidates.stages).toHaveLength(0);
    snapshot.artifacts[0].created_at = OLD;
    snapshot.artifacts[0].sync_id = "other";
    expect(plan(snapshot).candidates.stages).toHaveLength(0);
  });
  test("recent completion, missing completion and running stages are retained", () => {
    for (const completed_at of [RECENT, null, CUTOFF]) {
      const snapshot = fixture();
      snapshot.syncs[0].completed_at = completed_at;
      expect(plan(snapshot).candidates.artifacts).toHaveLength(0);
    }
    const snapshot = fixture();
    snapshot.stages[0].status = "running";
    expect(plan(snapshot).candidates.artifacts).toHaveLength(0);
    expect(plan(snapshot).candidates.stages).toHaveLength(0);
  });
  test("shared object paths stay when any other artefact is protected", () => {
    const snapshot = fixture();
    snapshot.artifacts.push({ ...snapshot.artifacts[0], id: "retained" });
    snapshot.extractions.push({
      id: "extraction",
      request_artifact_id: "retained",
    });
    expect(plan(snapshot).candidates.objects).toHaveLength(0);
    expect(plan(snapshot).candidates.stages).toHaveLength(0);
  });
  test("recognised old orphans with no sync are disposable, and input order does not alter approval", () => {
    const snapshot = fixture();
    snapshot.syncs = [];
    snapshot.artifacts = [];
    snapshot.stages = [];
    snapshot.changes = [];
    expect(plan(snapshot).candidates.objects).toHaveLength(1);
    const original = fixture();
    original.changes.push({ ...original.changes[0], id: "2" });
    const token = plan(original).token;
    original.changes.reverse();
    expect(plan(original).token).toBe(token);
  });

  test("keeps upload-before-row orphans when a terminal sync still has an unfinished stage", () => {
    const snapshot = fixture();
    snapshot.artifacts = [];
    snapshot.stages[0].status = "running";
    expect(plan(snapshot).candidates.objects).toHaveLength(0);
  });
});

describe("approval and execution", () => {
  test("defaults to dry run and rejects incomplete, repeated and invalid flags", () => {
    expect(
      parseRetentionArgs([], new Date("2026-10-10T12:00:00Z")),
    ).toMatchObject({ apply: false, cutoff: "2026-07-12T00:00:00.000Z" });
    for (const args of [
      ["--apply"],
      ["--confirm", "x"],
      ["--days", "0"],
      ["--days", "-1"],
      ["--unknown"],
      ["--days", "90", "--days", "90"],
      ["--cutoff", "bad"],
    ]) {
      expect(() => parseRetentionArgs(args)).toThrow();
    }
  });
  test("requires explicit hosted opt-in and refuses mismatched Storage projects", async () => {
    await expect(
      resolveRetentionTarget({
        COURSEMAP_SYNC_DATABASE_URL:
          "postgres://postgres:secret@db.example.supabase.co/postgres",
      }),
    ).rejects.toThrow("COURSEMAP_RETENTION_ALLOW_HOSTED");
    await expect(
      resolveRetentionTarget({
        COURSEMAP_RETENTION_ALLOW_HOSTED: "1",
        COURSEMAP_SYNC_DATABASE_URL:
          "postgres://postgres:secret@db.example.supabase.co/postgres",
        NEXT_PUBLIC_SUPABASE_URL: "https://different.supabase.co",
      }),
    ).rejects.toThrow("same project");
  });
  test("hash is deterministic, binds target, cutoff and complete candidate contents, and rejects stale approval", () => {
    const approved = plan();
    expect(plan().token).toBe(approved.token);
    expect(() => confirmRetentionPlan(approved, approved.token)).not.toThrow();
    for (const changed of [
      plan(fixture(), { target: "other" }),
      plan(fixture(), { cutoff: RECENT }),
    ]) {
      expect(() => confirmRetentionPlan(changed, approved.token)).toThrow(
        "stale",
      );
    }
    const snapshot = fixture();
    snapshot.changes[0].row_bytes++;
    expect(() => confirmRetentionPlan(plan(snapshot), approved.token)).toThrow(
      "stale",
    );
    expect(() => confirmRetentionPlan(approved, null)).toThrow();
  });
  test("never calls a mutator without the matching token", async () => {
    let calls = 0;
    await expect(
      applyRetentionPlan({
        plan: plan(),
        confirm: "bad",
        deleteBatch: async () => calls++,
        removeObjects: async () => calls++,
      }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
  test("commits rows before Storage; partial failure stops and reports progress for a new approved retry", async () => {
    const approved = plan();
    const calls = [];
    const summary = await applyRetentionPlan({
      plan: approved,
      confirm: approved.token,
      deleteBatch: async (category, rows) => {
        calls.push(category);
        return rows.length;
      },
      removeObjects: async () => {
        calls.push("objects");
        throw new Error("Storage unavailable.");
      },
    });
    expect(calls).toEqual(["changes", "artifacts", "stages", "objects"]);
    expect(summary).toMatchObject({
      status: "partial_failure",
      deleted: { changes: 1, artifacts: 1, stages: 1, objects: 0 },
    });
    const retry = fixture();
    retry.changes = [];
    retry.artifacts = [];
    retry.stages = [];
    expect(plan(retry).candidates.objects[0].category).toBe("orphan_objects");
  });
  test("batches rows at 50 and objects at 20 and journals the pending batch before mutation", async () => {
    const snapshot = fixture();
    snapshot.changes = Array.from({ length: 101 }, (_, index) => ({
      ...snapshot.changes[0],
      id: String(index),
    }));
    snapshot.artifacts = [];
    snapshot.stages = [];
    snapshot.objects = Array.from({ length: 41 }, (_, index) => ({
      ...snapshot.objects[0],
      id: String(index),
      name: `2026/${SYNC}/source_fetch/file-${index}.html`,
    }));
    const approved = plan(snapshot);
    const batches = [];
    let pending;
    const result = await applyRetentionPlan({
      plan: approved,
      confirm: approved.token,
      onProgress: async (summary) => {
        pending = summary.pendingBatch
          ? structuredClone(summary.pendingBatch)
          : null;
      },
      deleteBatch: async (category, rows) => {
        expect(pending.ids).toEqual(rows.map((row) => row.id));
        batches.push([category, rows.length]);
        return rows.length;
      },
      removeObjects: async (rows) => {
        expect(pending.category).toBe("objects");
        batches.push(["objects", rows.length]);
        return rows.length;
      },
    });
    expect(batches).toEqual([
      ["changes", 50],
      ["changes", 50],
      ["changes", 1],
      ["objects", 20],
      ["objects", 20],
      ["objects", 1],
    ]);
    expect(result.status).toBe("complete");
    expect(result.pendingBatch).toBeUndefined();
  });
});
