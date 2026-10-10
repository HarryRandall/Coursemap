import { createHash, timingSafeEqual } from "node:crypto";

import {
  assertHostedSupabaseDatabaseUrl,
  assertLoopbackDatabaseUrl,
  discoverLocalDatabaseUrl,
} from "./local-database.mjs";

export const RETENTION_BUCKET = "course-import-artifacts";
const TERMINAL_SYNCS = new Set([
  "unchanged",
  "review_required",
  "applied",
  "failed",
  "cancelled",
]);
const DAY_MS = 86_400_000;

function olderThan(value, cutoff) {
  return (
    value != null &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) < Date.parse(cutoff)
  );
}
function objectKey(bucket, path) {
  return `${bucket}/${path}`;
}
function byId(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}
function sorted(rows) {
  return [...rows].sort((left, right) =>
    String(left.id).localeCompare(String(right.id), "en"),
  );
}

/** Retain entire version-related evidence bundles, including unpublished versions.
 * This avoids guessing which intermediate artefact explains copied field evidence.
 */
export function buildRetentionPlan(snapshot, { cutoff, target }) {
  if (!target || !Number.isFinite(Date.parse(cutoff)))
    throw new Error("A retention target and valid cutoff are required.");
  cutoff = new Date(cutoff).toISOString();
  const syncs = byId(snapshot.syncs);
  const stages = byId(snapshot.stages);
  const runs = byId(snapshot.runs);
  const eventChanges = new Set(
    snapshot.events.map((row) => row.sync_change_id).filter(Boolean),
  );
  const versionIds = new Set(snapshot.versions.map((row) => row.id));
  const versionDocuments = new Set(
    [
      ...snapshot.versions.map((row) => row.source_document_id),
      ...snapshot.provenance.map((row) => row.source_document_id),
    ].filter(Boolean),
  );
  const versionSyncs = new Set(
    snapshot.versions.map((row) => row.sync_id).filter(Boolean),
  );
  const runSyncs = new Set(
    snapshot.runItems
      .filter((item) => runs.get(item.run_id)?.state !== "cancelled")
      .map((item) => item.sync_id),
  );
  const unfinishedStageSyncs = new Set(
    (snapshot.stageStates ?? snapshot.stages)
      .filter(
        (stage) =>
          !["completed", "failed"].includes(stage.status) ||
          !olderThan(stage.completed_at, cutoff),
      )
      .map((stage) => stage.sync_id),
  );
  const reviewSyncs = new Set([
    ...(snapshot.reviewSyncs ?? []).map((row) => row.sync_id),
    ...snapshot.changes
      .filter(
        (row) =>
          row.superseded_at == null ||
          row.decision == null ||
          eventChanges.has(row.id),
      )
      .map((row) => row.sync_id),
  ]);
  const extractionArtifacts = new Set(
    snapshot.extractions
      .flatMap((row) => [
        row.request_artifact_id,
        row.response_artifact_id,
        row.validated_artifact_id,
      ])
      .filter(Boolean),
  );
  const bodyPaths = new Set(
    [...snapshot.documents, ...snapshot.pages]
      .filter((row) => row.storage_bucket && row.storage_path)
      .map((row) => objectKey(row.storage_bucket, row.storage_path)),
  );
  const candidates = { changes: [], artifacts: [], stages: [], objects: [] };
  const rejected = { changes: [], artifacts: [], stages: [], objects: [] };
  function classify(category, row, reason) {
    const syncId = row.sync_id ?? row.name?.split("/")[1];
    const candidate = { ...row, syncGuard: syncs.get(syncId) ?? null };
    (reason ? rejected : candidates)[category].push(
      reason ? { ...row, reason } : candidate,
    );
  }
  function syncReason(syncId, evidence = false) {
    const sync = syncs.get(syncId);
    if (!sync || !TERMINAL_SYNCS.has(sync.status)) return "non_terminal_sync";
    if (runSyncs.has(syncId)) return "active_or_paused_run";
    if (!olderThan(sync.completed_at, cutoff))
      return "recent_or_missing_sync_completion";
    if (
      evidence &&
      (versionSyncs.has(syncId) ||
        versionIds.has(sync.source_version_id) ||
        versionDocuments.has(sync.source_document_id))
    )
      return "version_evidence_bundle";
    if (evidence && unfinishedStageSyncs.has(syncId))
      return "unfinished_or_recent_stage_bundle";
    if (evidence && reviewSyncs.has(syncId))
      return "review_or_audit_evidence_bundle";
    return null;
  }
  for (const row of snapshot.changes) {
    classify(
      "changes",
      row,
      syncReason(row.sync_id) ||
        (eventChanges.has(row.id) ? "change_event_reference" : null) ||
        (row.superseded_at == null ? "current_review" : null) ||
        (row.decision == null ? "undecided_review" : null) ||
        (![row.created_at, row.superseded_at, row.resolved_at].every((value) =>
          olderThan(value, cutoff),
        )
          ? "recent_review"
          : null),
    );
  }
  for (const row of snapshot.artifacts) {
    const stage = stages.get(row.stage_id);
    classify(
      "artifacts",
      row,
      syncReason(row.sync_id, true) ||
        (extractionArtifacts.has(row.id) ? "extraction_reference" : null) ||
        (!stage || stage.sync_id !== row.sync_id ? "mismatched_stage" : null) ||
        (!stage ||
        !["completed", "failed"].includes(stage.status) ||
        !olderThan(stage.completed_at, cutoff)
          ? "unfinished_or_recent_stage"
          : null) ||
        (!olderThan(row.created_at, cutoff) ? "recent_artifact" : null),
    );
  }
  const deletedArtifacts = new Set(candidates.artifacts.map((row) => row.id));
  const retainedStages = new Set(
    snapshot.artifacts
      .filter((row) => !deletedArtifacts.has(row.id))
      .map((row) => row.stage_id),
  );
  for (const row of snapshot.stages) {
    classify(
      "stages",
      row,
      syncReason(row.sync_id, true) ||
        (retainedStages.has(row.id) ? "retained_artifact" : null) ||
        (!["completed", "failed"].includes(row.status) ||
        !olderThan(row.completed_at, cutoff)
          ? "unfinished_or_recent_stage"
          : null),
    );
  }
  const referencedPaths = new Set(
    snapshot.artifacts.map((row) =>
      objectKey(row.storage_bucket, row.storage_path),
    ),
  );
  const retainedPaths = new Set(
    snapshot.artifacts
      .filter((row) => !deletedArtifacts.has(row.id))
      .map((row) => objectKey(row.storage_bucket, row.storage_path)),
  );
  for (const row of snapshot.objects) {
    const key = objectKey(RETENTION_BUCKET, row.name);
    // Upload precedes DB registration. Only worker-shaped paths identify which
    // sync must be checked before calling an apparently orphaned upload disposable.
    const syncId = row.name
      .match(
        /^\d{4}\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^/]+\/[^/]+$/iu,
      )?.[1]
      ?.toLowerCase();
    const linked = referencedPaths.has(key);
    const reason = bodyPaths.has(key)
      ? "source_body_reference"
      : retainedPaths.has(key)
        ? "retained_artifact_reference"
        : !syncId
          ? "unrecognised_object_path"
          : syncs.has(syncId)
            ? syncReason(syncId, true)
            : null;
    classify(
      "objects",
      { ...row, category: linked ? "artifact_objects" : "orphan_objects" },
      reason ||
        (![row.created_at, row.updated_at].every((value) =>
          olderThan(value, cutoff),
        )
          ? "recent_object"
          : null),
    );
  }
  for (const category of Object.keys(candidates)) {
    candidates[category] = sorted(candidates[category]);
    rejected[category] = sorted(rejected[category]);
  }
  const summary = Object.fromEntries(
    Object.entries(candidates).map(([category, rows]) => [
      category,
      {
        count: rows.length,
        rowBytes: rows.reduce(
          (total, row) => total + Number(row.row_bytes ?? 0),
          0,
        ),
        payloadBytes: rows.reduce(
          (total, row) => total + Number(row.payload_bytes ?? 0),
          0,
        ),
        sampleIds: rows.slice(0, 5).map((row) => row.id),
      },
    ]),
  );
  const rejectedSummary = Object.fromEntries(
    Object.entries(rejected).map(([category, rows]) => [
      category,
      Object.fromEntries(
        [...new Set(rows.map((row) => row.reason))].sort().map((reason) => {
          const matching = rows.filter((row) => row.reason === reason);
          return [
            reason,
            {
              count: matching.length,
              sampleIds: matching.slice(0, 5).map((row) => row.id),
            },
          ];
        }),
      ),
    ]),
  );
  for (const category of ["artifact_objects", "orphan_objects"]) {
    const rows = candidates.objects.filter((row) => row.category === category);
    summary[category] = {
      count: rows.length,
      rowBytes: rows.reduce((sum, row) => sum + Number(row.row_bytes ?? 0), 0),
      payloadBytes: rows.reduce(
        (sum, row) => sum + Number(row.payload_bytes ?? 0),
        0,
      ),
      sampleIds: rows.slice(0, 5).map((row) => row.id),
    };
  }
  const approved = { policy: 1, target, cutoff, candidates };
  const token = createHash("sha256")
    .update(JSON.stringify(approved))
    .digest("hex");
  return {
    ...approved,
    token,
    summary,
    rejected,
    rejectedSummary,
    retained: snapshot.retained,
  };
}

export function confirmRetentionPlan(plan, token) {
  if (
    typeof token !== "string" ||
    !/^[0-9a-f]{64}$/u.test(token) ||
    !timingSafeEqual(Buffer.from(plan.token), Buffer.from(token))
  ) {
    throw new Error(
      "The retention approval is missing or stale. Review a fresh dry run and its token.",
    );
  }
}

export function parseRetentionArgs(args, now = new Date()) {
  const options = { apply: false, days: 90 };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag))
      throw new Error(`The retention option ${flag} was repeated.`);
    seen.add(flag);
    if (flag === "--apply") options.apply = true;
    else if (["--days", "--cutoff", "--confirm", "--report"].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`The retention option ${flag} requires a value.`);
      options[flag.slice(2)] = flag === "--days" ? Number(value) : value;
    } else throw new Error(`The retention option ${flag} is not recognised.`);
  }
  if (!Number.isSafeInteger(options.days) || options.days < 1)
    throw new Error("Retention days must be a positive integer.");
  if (options.apply !== Boolean(options.confirm))
    throw new Error("Applying retention requires both --apply and --confirm.");
  if (options.cutoff && seen.has("--days"))
    throw new Error("Choose either --days or --cutoff for retention.");
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const cutoff = options.cutoff
    ? Date.parse(options.cutoff)
    : today - options.days * DAY_MS;
  if (!Number.isFinite(cutoff) || cutoff > today || cutoff < 0)
    throw new Error("The retention cutoff must be a valid past date.");
  return { ...options, cutoff: new Date(cutoff).toISOString() };
}

/** Select an explicit hosted connection separately from the local-only helper. */
export async function resolveRetentionTarget(env = process.env) {
  const hostedUrl = env.COURSEMAP_SYNC_DATABASE_URL?.trim();
  if (
    hostedUrl &&
    (env.COURSEMAP_DATABASE_URL?.trim() || env.DATABASE_URL?.trim())
  )
    throw new Error("Choose one local or hosted retention database URL.");
  if (hostedUrl && env.COURSEMAP_RETENTION_ALLOW_HOSTED !== "1")
    throw new Error(
      "Hosted retention requires COURSEMAP_RETENTION_ALLOW_HOSTED=1 explicitly.",
    );
  const databaseUrl = hostedUrl
    ? assertHostedSupabaseDatabaseUrl(hostedUrl)
    : new URL(await discoverLocalDatabaseUrl({ env }));
  const storageUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (storageUrl) {
    const storage = new URL(storageUrl);
    if (hostedUrl) {
      const project = databaseUrl.hostname.startsWith("db.")
        ? databaseUrl.hostname.split(".")[1]
        : decodeURIComponent(databaseUrl.username).match(
            /^postgres\.([a-z0-9]+)$/u,
          )?.[1];
      if (
        !project ||
        storage.protocol !== "https:" ||
        storage.hostname !== `${project}.supabase.co` ||
        storage.pathname !== "/" ||
        storage.port ||
        storage.username ||
        storage.password ||
        storage.search ||
        storage.hash
      )
        throw new Error(
          "Retention database and Storage must use the same project with its canonical HTTPS URL.",
        );
    } else {
      await assertLoopbackDatabaseUrl(`postgresql://${storage.host}/postgres`);
      if (!["http:", "https:"].includes(storage.protocol))
        throw new Error("Local retention Storage requires an HTTP URL.");
    }
  } else if (hostedUrl)
    throw new Error(
      "Hosted retention requires NEXT_PUBLIC_SUPABASE_URL for the same project.",
    );
  return {
    hosted: Boolean(hostedUrl),
    connectionString: databaseUrl.toString(),
    storageUrl,
    target: `${hostedUrl ? "hosted" : "local"}:${databaseUrl.host}${databaseUrl.pathname}:${decodeURIComponent(databaseUrl.username)}:${storageUrl ?? "no-storage"}`,
  };
}
