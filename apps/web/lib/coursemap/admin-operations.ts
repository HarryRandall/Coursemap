import "server-only";
import type { CatalogueKind } from "@/lib/catalogue/content";
import { createClient } from "@/lib/supabase/server";

export const OPERATIONS_PAGE_SIZE = 25;

export type SyncOperationRow = {
  id: string;
  code: string;
  kind: CatalogueKind;
  academicYear: number;
  status: string;
  trigger: "manual" | "scheduled";
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  attemptCount: number;
  model: string | null;
  costUsd: number;
  errorCode: string | null;
};

export type SyncOperationsPage = {
  rows: SyncOperationRow[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  status: string;
};

function durationMs(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return null;
  return Date.parse(completedAt) - Date.parse(startedAt);
}

/** The technical list of ANU syncs, newest first, across every record. */
export async function loadSyncOperationsPage({
  query = "",
  status = "all",
  page = 1,
}: {
  query?: string;
  status?: string;
  page?: number;
}): Promise<SyncOperationsPage> {
  const supabase = await createClient();
  let request = supabase
    .from("catalogue_syncs")
    .select(
      "id,record_id,status,trigger,requested_model,requested_at,started_at,completed_at,attempt_count,error_code,catalogue_records!inner(kind,academic_years!inner(year),catalogue_codes!inner(code))",
      { count: "exact" },
    )
    .order("requested_at", { ascending: false });
  if (status !== "all") request = request.eq("status", status);
  const needle = query.trim().toUpperCase();
  if (needle) {
    request = request.ilike(
      "catalogue_records.catalogue_codes.code",
      `%${needle}%`,
    );
  }
  const safePage = Math.max(1, page);
  const from = (safePage - 1) * OPERATIONS_PAGE_SIZE;
  const { data, error, count } = await request.range(
    from,
    from + OPERATIONS_PAGE_SIZE - 1,
  );
  if (error) throw error;

  const syncIds = (data ?? []).map((sync) => sync.id);
  const { data: extractions, error: extractionError } = syncIds.length
    ? await supabase
        .from("catalogue_extractions")
        .select("sync_id,resolved_model,requested_model,cost_usd")
        .in("sync_id", syncIds)
    : { data: [], error: null };
  if (extractionError) throw extractionError;
  const costBySync = new Map<string, { cost: number; model: string | null }>();
  for (const extraction of extractions ?? []) {
    const current = costBySync.get(extraction.sync_id) ?? {
      cost: 0,
      model: null,
    };
    current.cost += Number(extraction.cost_usd ?? 0);
    current.model =
      extraction.resolved_model ?? extraction.requested_model ?? current.model;
    costBySync.set(extraction.sync_id, current);
  }

  return {
    rows: (data ?? []).map((sync) => {
      const record = sync.catalogue_records;
      const usage = costBySync.get(sync.id);
      return {
        id: sync.id,
        code: record.catalogue_codes.code,
        kind: record.kind as CatalogueKind,
        academicYear: record.academic_years.year,
        status: sync.status,
        trigger: sync.trigger as "manual" | "scheduled",
        requestedAt: sync.requested_at,
        startedAt: sync.started_at,
        completedAt: sync.completed_at,
        durationMs: durationMs(sync.started_at, sync.completed_at),
        attemptCount: sync.attempt_count,
        model: usage?.model ?? sync.requested_model,
        costUsd: usage?.cost ?? 0,
        errorCode: sync.error_code,
      } satisfies SyncOperationRow;
    }),
    total: count ?? 0,
    page: safePage,
    pageSize: OPERATIONS_PAGE_SIZE,
    query,
    status,
  };
}

export type SyncStage = {
  id: string;
  stageName: string;
  attemptNumber: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorSummary: string | null;
};

export type SyncArtefact = {
  id: string;
  kind: string;
  attemptNumber: number;
  mediaType: string;
  byteSize: number;
};

export type SyncExtraction = {
  id: string;
  extractionNumber: number;
  requestedModel: string;
  resolvedModel: string | null;
  reusedFromExtractionId: string | null;
  validationStatus: string;
  schemaValid: boolean | null;
  domainValid: boolean | null;
  warningCount: number;
  errorCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  costSource: string;
  latencyMs: number | null;
  finishReason: string | null;
  errorSummary: string | null;
};

export type SyncDetail = {
  id: string;
  code: string;
  kind: CatalogueKind;
  academicYear: number;
  recordId: number;
  status: string;
  trigger: "manual" | "scheduled";
  requestedModel: string;
  parserVersion: string;
  promptVersion: string;
  schemaVersion: string;
  requestedAt: string;
  startedAt: string | null;
  checkedAt: string | null;
  completedAt: string | null;
  attemptCount: number;
  workerId: string | null;
  leaseExpiresAt: string | null;
  queueMessageId: string | null;
  dispatchedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sourceVersionId: number | null;
  previousSourceVersionId: number | null;
  sourceDocument: {
    canonicalUrl: string;
    contentSha256: string;
    httpStatus: number | null;
    fetchedAt: string;
    byteSize: number | null;
    mediaType: string;
  } | null;
  stages: SyncStage[];
  artefacts: SyncArtefact[];
  extractions: SyncExtraction[];
  changeCount: number;
};

/** Everything recorded about one sync, for a developer reading a failure. */
export async function loadSyncDetail(
  syncId: string,
): Promise<SyncDetail | null> {
  const supabase = await createClient();
  const { data: sync, error } = await supabase
    .from("catalogue_syncs")
    .select(
      "*,catalogue_records!inner(id,kind,academic_years!inner(year),catalogue_codes!inner(code))",
    )
    .eq("id", syncId)
    .maybeSingle();
  if (error) throw error;
  if (!sync) return null;

  const [stages, artefacts, extractions, document, changes] = await Promise.all(
    [
      supabase
        .from("catalogue_sync_stages")
        .select("*")
        .eq("sync_id", syncId)
        .order("started_at"),
      supabase
        .from("catalogue_sync_artifacts")
        .select("id,kind,attempt_number,media_type,byte_size")
        .eq("sync_id", syncId)
        .order("created_at"),
      supabase
        .from("catalogue_extractions")
        .select("*")
        .eq("sync_id", syncId)
        .order("extraction_number"),
      sync.source_document_id
        ? supabase
            .from("catalogue_source_documents")
            .select(
              "canonical_url,content_sha256,http_status,fetched_at,byte_size,media_type",
            )
            .eq("id", sync.source_document_id)
            .maybeSingle()
        : { data: null, error: null },
      supabase
        .from("catalogue_sync_changes")
        .select("id", { count: "exact", head: true })
        .eq("sync_id", syncId),
    ],
  );
  if (stages.error) throw stages.error;
  if (artefacts.error) throw artefacts.error;
  if (extractions.error) throw extractions.error;
  if (document.error) throw document.error;
  if (changes.error) throw changes.error;

  const record = sync.catalogue_records;
  return {
    id: sync.id,
    code: record.catalogue_codes.code,
    kind: record.kind as CatalogueKind,
    academicYear: record.academic_years.year,
    recordId: record.id,
    status: sync.status,
    trigger: sync.trigger as "manual" | "scheduled",
    requestedModel: sync.requested_model,
    parserVersion: sync.parser_version,
    promptVersion: sync.prompt_version,
    schemaVersion: sync.schema_version,
    requestedAt: sync.requested_at,
    startedAt: sync.started_at,
    checkedAt: sync.checked_at,
    completedAt: sync.completed_at,
    attemptCount: sync.attempt_count,
    workerId: sync.worker_id,
    leaseExpiresAt: sync.lease_expires_at,
    queueMessageId: sync.queue_message_id,
    dispatchedAt: sync.dispatched_at,
    errorCode: sync.error_code,
    errorMessage: sync.error_message,
    sourceVersionId: sync.source_version_id,
    previousSourceVersionId: sync.previous_source_version_id,
    sourceDocument: document.data
      ? {
          canonicalUrl: document.data.canonical_url,
          contentSha256: document.data.content_sha256,
          httpStatus: document.data.http_status,
          fetchedAt: document.data.fetched_at,
          byteSize: document.data.byte_size,
          mediaType: document.data.media_type,
        }
      : null,
    stages: (stages.data ?? []).map((stage) => ({
      id: stage.id,
      stageName: stage.stage_name,
      attemptNumber: stage.attempt_number,
      status: stage.status,
      startedAt: stage.started_at,
      completedAt: stage.completed_at,
      durationMs: durationMs(stage.started_at, stage.completed_at),
      errorCode: stage.error_code,
      errorSummary: stage.error_summary,
    })),
    artefacts: (artefacts.data ?? []).map((artefact) => ({
      id: artefact.id,
      kind: artefact.kind,
      attemptNumber: artefact.attempt_number,
      mediaType: artefact.media_type,
      byteSize: artefact.byte_size,
    })),
    extractions: (extractions.data ?? []).map((extraction) => ({
      id: extraction.id,
      extractionNumber: extraction.extraction_number,
      requestedModel: extraction.requested_model,
      resolvedModel: extraction.resolved_model,
      reusedFromExtractionId: extraction.reused_from_extraction_id,
      validationStatus: extraction.validation_status,
      schemaValid: extraction.schema_valid,
      domainValid: extraction.domain_valid,
      warningCount: extraction.warning_count,
      errorCount: extraction.error_count,
      inputTokens: extraction.input_tokens,
      cachedInputTokens: extraction.cached_input_tokens,
      outputTokens: extraction.output_tokens,
      reasoningTokens: extraction.reasoning_tokens,
      costUsd: Number(extraction.cost_usd ?? 0),
      costSource: extraction.cost_source,
      latencyMs: extraction.latency_ms,
      finishReason: extraction.finish_reason,
      errorSummary: extraction.error_summary,
    })),
    changeCount: changes.count ?? 0,
  };
}

export type DiscoveryCheckRow = {
  id: number;
  kind: CatalogueKind;
  academicYear: number;
  status: string;
  isComplete: boolean;
  discoveredCount: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
};

/** Recent ANU listing checks, newest first. */
export async function loadDiscoveryChecks(
  limit = OPERATIONS_PAGE_SIZE,
): Promise<DiscoveryCheckRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogue_discovery_checks")
    .select("*,academic_years!inner(year)")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((check) => ({
    id: check.id,
    kind: check.kind as CatalogueKind,
    academicYear: check.academic_years.year,
    status: check.status,
    isComplete: check.is_complete,
    discoveredCount: check.discovered_count,
    startedAt: check.started_at,
    completedAt: check.completed_at,
    durationMs: durationMs(check.started_at, check.completed_at),
    errorCode: check.error_code,
    errorMessage: check.error_message,
  }));
}

export type DiscoveryCheckDetail = DiscoveryCheckRow & {
  retiredCount: number;
  listedCount: number;
  sourcePages: Array<{
    id: number;
    canonicalUrl: string;
    httpStatus: number | null;
    fetchedAt: string;
    contentSha256: string;
  }>;
};

/** One listing check, with the pages it read and what it concluded. */
export async function loadDiscoveryCheck(
  checkId: number,
): Promise<DiscoveryCheckDetail | null> {
  const supabase = await createClient();
  const { data: check, error } = await supabase
    .from("catalogue_discovery_checks")
    .select("*,academic_years!inner(year)")
    .eq("id", checkId)
    .maybeSingle();
  if (error) throw error;
  if (!check) return null;

  const [pages, listings] = await Promise.all([
    supabase
      .from("catalogue_discovery_check_source_pages")
      .select(
        "source_page_id,catalogue_source_pages!inner(id,canonical_url,http_status,fetched_at,content_sha256)",
      )
      .eq("discovery_check_id", checkId),
    supabase
      .from("catalogue_listings")
      .select("is_current", { count: "exact" })
      .eq("academic_year_id", check.academic_year_id)
      .eq("kind", check.kind),
  ]);
  if (pages.error) throw pages.error;
  if (listings.error) throw listings.error;

  const rows = listings.data ?? [];
  return {
    id: check.id,
    kind: check.kind as CatalogueKind,
    academicYear: check.academic_years.year,
    status: check.status,
    isComplete: check.is_complete,
    discoveredCount: check.discovered_count,
    startedAt: check.started_at,
    completedAt: check.completed_at,
    durationMs: durationMs(check.started_at, check.completed_at),
    errorCode: check.error_code,
    errorMessage: check.error_message,
    listedCount: rows.filter((listing) => listing.is_current).length,
    retiredCount: rows.filter((listing) => !listing.is_current).length,
    sourcePages: (pages.data ?? []).map((page) => ({
      id: page.catalogue_source_pages.id,
      canonicalUrl: page.catalogue_source_pages.canonical_url,
      httpStatus: page.catalogue_source_pages.http_status,
      fetchedAt: page.catalogue_source_pages.fetched_at,
      contentSha256: page.catalogue_source_pages.content_sha256,
    })),
  };
}
