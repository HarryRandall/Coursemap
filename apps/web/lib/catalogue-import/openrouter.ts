import { getCanonicalSiteOrigin } from "../supabase/config.ts";
import {
  repairStructuredResponse,
  type StructuredResponseRepair,
} from "./response-repair.ts";

export const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.1-flash-lite";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_REQUEST_TIMEOUT_MS = 35_000;
const OPENROUTER_PROVIDER_DETAIL_MAX_LENGTH = 400;
const MODEL_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/;

type JsonSchema = Record<string, unknown>;
export type OpenRouterReasoningEffort = "minimal" | "low";

export type OpenRouterRequestBody = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: 0;
  max_tokens: number;
  stream: false;
  reasoning: { effort: OpenRouterReasoningEffort; exclude: true };
  provider: { require_parameters: true };
  response_format: { type: "json_object" };
};

type OpenRouterUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  cost?: unknown;
  prompt_tokens_details?: {
    cached_tokens?: unknown;
  } | null;
  completion_tokens_details?: {
    reasoning_tokens?: unknown;
  } | null;
};

type OpenRouterResponse = {
  id?: unknown;
  model?: unknown;
  created?: unknown;
  error?: unknown;
  openrouter_metadata?: unknown;
  choices?: Array<{
    finish_reason?: unknown;
    native_finish_reason?: unknown;
    error?: unknown;
    message?: {
      content?: unknown;
    };
  }>;
  usage?: OpenRouterUsage | null;
};

export type OpenRouterRouterMetadata = {
  requested: string | null;
  strategy: string | null;
  region: string | null;
  summary: string | null;
  attempt: number | null;
  isByok: boolean | null;
  selectedProvider: string | null;
  attempts: Array<{
    provider: string | null;
    model: string | null;
    status: number | null;
  }>;
};

export type OpenRouterExtraction = {
  generationId: string | null;
  requestedModel: string;
  resolvedModel: string;
  finishReason: string | null;
  nativeFinishReason: string | null;
  providerError: OpenRouterProviderError | null;
  content: string | null;
  parsed: unknown;
  responseError: string | null;
  responseRepair: StructuredResponseRepair;
  latencyMilliseconds: number;
  routerMetadata: OpenRouterRouterMetadata | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    cachedInputTokens: number | null;
    reasoningTokens: number | null;
    costUsd: number | null;
  };
  responseForAudit: {
    id: string | null;
    model: string;
    created: number | null;
    finishReason: string | null;
    nativeFinishReason: string | null;
    providerError: OpenRouterProviderError | null;
    content: string | null;
    responseError: string | null;
    responseRepair: OpenRouterExtraction["responseRepair"];
    rawResponseText: string | null;
    routerMetadata: OpenRouterRouterMetadata | null;
    usage: OpenRouterExtraction["usage"];
    latencyMilliseconds: number;
  };
};

export type OpenRouterProviderError = {
  code: number | string | null;
  message: string | null;
  errorType: string | null;
  providerCode: string | null;
  providerName: string | null;
};

export class OpenRouterConfigurationError extends Error {
  constructor(
    message = "Configure a dedicated OPENROUTER_API_KEY before running imports.",
  ) {
    super(message);
    this.name = "OpenRouterConfigurationError";
  }
}

export class OpenRouterRequestError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly providerName: string | null;

  constructor(
    message: string,
    status: number,
    providerName: string | null = null,
  ) {
    super(message);
    this.name = "OpenRouterRequestError";
    this.status = status;
    this.providerName = providerName;
    this.retryable =
      status === 408 || status === 409 || status === 429 || status >= 500;
  }
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown) {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0
    ? number
    : null;
}

function boundedMetadataText(value: unknown, maximumLength = 500) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/gu, " ").trim();
  return text ? text.slice(0, maximumLength) : null;
}

/** Retains diagnostic fields without raw provider payloads or reasoning. */
function providerError(value: unknown): OpenRouterProviderError | null {
  if (value === undefined || value === null) return null;
  const error =
    typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const metadata =
    typeof error.metadata === "object" &&
    error.metadata !== null &&
    !Array.isArray(error.metadata)
      ? (error.metadata as Record<string, unknown>)
      : {};
  return {
    code:
      nonNegativeInteger(error.code) ?? boundedMetadataText(error.code, 120),
    message: boundedMetadataText(error.message, 400),
    errorType: boundedMetadataText(metadata.error_type ?? error.errorType, 120),
    providerCode: boundedMetadataText(
      metadata.provider_code ?? error.providerCode,
      120,
    ),
    providerName: boundedMetadataText(
      metadata.provider_name ?? error.providerName,
      120,
    ),
  };
}

function providerResponseProblem(
  error: OpenRouterProviderError | null,
  finishReason: string | null,
) {
  if (error !== null) {
    const code = error.code === null ? "" : ` (${error.code})`;
    const detail = error.message ? `: ${error.message}` : ".";
    return `OpenRouter provider failed during generation${code}${detail} The extraction cannot be treated as complete.`;
  }
  if (finishReason === "error") {
    return "OpenRouter provider failed before finishing the extraction. The response cannot be treated as complete.";
  }
  return null;
}

function routerMetadata(value: unknown): OpenRouterRouterMetadata | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const metadata = value as Record<string, unknown>;
  const endpoints =
    typeof metadata.endpoints === "object" &&
    metadata.endpoints !== null &&
    !Array.isArray(metadata.endpoints)
      ? (metadata.endpoints as Record<string, unknown>)
      : null;
  const available = Array.isArray(endpoints?.available)
    ? endpoints.available.slice(0, 32)
    : [];
  const selectedProvider = available.find(
    (endpoint) =>
      typeof endpoint === "object" &&
      endpoint !== null &&
      !Array.isArray(endpoint) &&
      (endpoint as Record<string, unknown>).selected === true,
  );
  const selectedProviderName =
    boundedMetadataText(metadata.selectedProvider, 120) ??
    (typeof selectedProvider === "object" && selectedProvider !== null
      ? boundedMetadataText(
          (selectedProvider as Record<string, unknown>).provider,
          120,
        )
      : null);
  const attempts = Array.isArray(metadata.attempts)
    ? metadata.attempts.slice(0, 16).flatMap((attempt) => {
        if (
          typeof attempt !== "object" ||
          attempt === null ||
          Array.isArray(attempt)
        ) {
          return [];
        }
        const record = attempt as Record<string, unknown>;
        return [
          {
            provider: boundedMetadataText(record.provider, 120),
            model: boundedMetadataText(record.model, 200),
            status: nonNegativeInteger(record.status),
          },
        ];
      })
    : [];
  return {
    requested: boundedMetadataText(metadata.requested, 200),
    strategy: boundedMetadataText(metadata.strategy, 80),
    region: boundedMetadataText(metadata.region, 80),
    summary: boundedMetadataText(metadata.summary),
    attempt: nonNegativeInteger(metadata.attempt),
    isByok:
      typeof metadata.is_byok === "boolean"
        ? metadata.is_byok
        : typeof metadata.isByok === "boolean"
          ? metadata.isByok
          : null,
    selectedProvider: selectedProviderName,
    attempts,
  };
}

export function assertOpenRouterModel(model: string) {
  const normalised = model.trim().toLowerCase();
  if (normalised.length > 120 || !MODEL_SLUG_PATTERN.test(normalised)) {
    throw new TypeError("The OpenRouter model identifier is invalid.");
  }
  return normalised;
}

function requireOpenRouterKey(env: NodeJS.ProcessEnv) {
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new OpenRouterConfigurationError();
  return key;
}

export function buildOpenRouterRequestBody({
  model,
  systemPrompt,
  modelInput,
  schema,
  schemaName = "course_extraction",
  maxOutputTokens = 12_000,
  reasoningEffort = "minimal",
}: {
  model: string;
  systemPrompt: string;
  modelInput: string;
  schema: JsonSchema;
  schemaName?: string;
  maxOutputTokens?: number;
  reasoningEffort?: OpenRouterReasoningEffort;
  env?: NodeJS.ProcessEnv;
}): OpenRouterRequestBody {
  const requestedModel = assertOpenRouterModel(model);
  if (!systemPrompt.trim() || !modelInput.trim()) {
    throw new TypeError(
      "OpenRouter extraction requires a prompt and course input.",
    );
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256) {
    throw new TypeError("maxOutputTokens must be an integer of at least 256.");
  }
  if (reasoningEffort !== "minimal" && reasoningEffort !== "low") {
    throw new TypeError("The extraction reasoning effort is not supported.");
  }
  const schemaJson = JSON.stringify(schema);
  return {
    model: requestedModel,
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\nTrusted output contract (${schemaName}). Return one JSON object matching this exact JSON Schema:\n${schemaJson}`,
      },
      { role: "user", content: modelInput },
    ],
    temperature: 0,
    max_tokens: maxOutputTokens,
    stream: false,
    reasoning: { effort: reasoningEffort, exclude: true },
    provider: { require_parameters: true },
    response_format: { type: "json_object" },
  };
}

function responseContent(response: unknown) {
  if (typeof response !== "object" || response === null) return null;
  const content = (response as OpenRouterResponse).choices?.[0]?.message
    ?.content;
  return typeof content === "string" && content.trim() ? content : null;
}

function parseStructuredContent(content: string | null, schemaName: string) {
  if (content === null) {
    return {
      parsed: null,
      responseError: "OpenRouter returned no structured course extraction.",
      responseRepair: null,
    };
  }
  try {
    return {
      parsed: JSON.parse(content) as unknown,
      responseError: null,
      responseRepair: null,
    };
  } catch {
    const repaired = repairStructuredResponse(content, schemaName);
    if (repaired)
      return {
        parsed: repaired.parsed,
        responseError: null,
        responseRepair: repaired.repair,
      };
    return {
      parsed: null,
      responseError:
        "OpenRouter returned invalid JSON despite structured-output mode.",
      responseRepair: null,
    };
  }
}

function auditNullableNumber(value: unknown, field: string) {
  if (value === null) return null;
  const parsed = finiteNumber(value);
  if (parsed === null || parsed < 0) {
    throw new TypeError(`Stored OpenRouter ${field} is invalid.`);
  }
  return parsed;
}

/** Reconstructs a paid model result from its verified audit artefact. */
export function restoreOpenRouterExtraction(
  value: unknown,
  requestedModel: string,
  schemaName = "course_extraction",
): OpenRouterExtraction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Stored OpenRouter response is invalid.");
  }
  const audit = value as Record<string, unknown>;
  if (
    typeof audit.model !== "string" ||
    !audit.model.trim() ||
    (audit.content !== null && typeof audit.content !== "string") ||
    typeof audit.usage !== "object" ||
    audit.usage === null ||
    Array.isArray(audit.usage)
  ) {
    throw new TypeError("Stored OpenRouter response is incomplete.");
  }
  const usage = audit.usage as Record<string, unknown>;
  const savedResponseError =
    typeof audit.responseError === "string" && audit.responseError.trim()
      ? audit.responseError
      : null;
  const rawResponseText =
    typeof audit.rawResponseText === "string" ? audit.rawResponseText : null;
  const restoredRouterMetadata = routerMetadata(audit.routerMetadata);
  const finishReason = boundedMetadataText(audit.finishReason, 120);
  const nativeFinishReason = boundedMetadataText(audit.nativeFinishReason, 120);
  const restoredProviderError = providerError(audit.providerError);
  const latencyMilliseconds = auditNullableNumber(
    audit.latencyMilliseconds,
    "latency",
  );
  if (latencyMilliseconds === null) {
    throw new TypeError("Stored OpenRouter latency is missing.");
  }

  const structured = parseStructuredContent(
    audit.content as string | null,
    schemaName,
  );
  const obsoleteParseError =
    structured.responseRepair !== null &&
    savedResponseError ===
      "OpenRouter returned invalid JSON despite structured-output mode.";
  const responseError =
    providerResponseProblem(restoredProviderError, finishReason) ??
    (obsoleteParseError ? null : savedResponseError) ??
    structured.responseError;
  return {
    generationId: typeof audit.id === "string" ? audit.id : null,
    requestedModel: assertOpenRouterModel(requestedModel),
    resolvedModel: audit.model,
    finishReason,
    nativeFinishReason,
    providerError: restoredProviderError,
    content: audit.content as string | null,
    parsed: structured.parsed,
    responseError,
    responseRepair: structured.responseRepair,
    latencyMilliseconds,
    routerMetadata: restoredRouterMetadata,
    usage: {
      inputTokens: auditNullableNumber(usage.inputTokens, "input tokens"),
      outputTokens: auditNullableNumber(usage.outputTokens, "output tokens"),
      totalTokens: auditNullableNumber(usage.totalTokens, "total tokens"),
      cachedInputTokens: auditNullableNumber(
        usage.cachedInputTokens,
        "cached input tokens",
      ),
      reasoningTokens: auditNullableNumber(
        usage.reasoningTokens,
        "reasoning tokens",
      ),
      costUsd: auditNullableNumber(usage.costUsd, "cost"),
    },
    responseForAudit: {
      ...(audit as OpenRouterExtraction["responseForAudit"]),
      finishReason,
      nativeFinishReason,
      providerError: restoredProviderError,
      responseError,
      responseRepair: structured.responseRepair,
      rawResponseText,
      routerMetadata: restoredRouterMetadata,
    },
  };
}

function boundedProviderDetail(value: unknown) {
  if (typeof value !== "string") return null;
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (!singleLine) return null;
  if (singleLine.length <= OPENROUTER_PROVIDER_DETAIL_MAX_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, OPENROUTER_PROVIDER_DETAIL_MAX_LENGTH - 3)}...`;
}

function safeErrorMessage(body: unknown, status: number) {
  let providerMessage: string | null = null;
  let providerDetail: string | null = null;
  if (typeof body === "object" && body !== null) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "object" && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) {
        providerMessage = message.trim();
      }
      const metadata = (error as { metadata?: unknown }).metadata;
      if (typeof metadata === "object" && metadata !== null) {
        providerDetail = boundedProviderDetail(
          (metadata as { raw?: unknown }).raw,
        );
      }
    }
  }
  const summary = providerMessage
    ? `OpenRouter request failed (${status}): ${providerMessage}`
    : `OpenRouter request failed with HTTP ${status}.`;
  return providerDetail
    ? `${summary} Provider detail: ${providerDetail}`
    : summary;
}

/**
 * Request one schema-guided course extraction. The API key and response
 * reasoning are deliberately excluded from the returned audit object.
 */
export async function extractWithOpenRouter({
  model,
  systemPrompt,
  modelInput,
  schema,
  schemaName = "course_extraction",
  maxOutputTokens = 12_000,
  reasoningEffort = "minimal",
  requestTimeoutMs = OPENROUTER_REQUEST_TIMEOUT_MS,
  env = process.env,
  fetchImpl = fetch,
  signal,
}: {
  model: string;
  systemPrompt: string;
  modelInput: string;
  schema: JsonSchema;
  schemaName?: string;
  maxOutputTokens?: number;
  reasoningEffort?: OpenRouterReasoningEffort;
  requestTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<OpenRouterExtraction> {
  const requestBody = buildOpenRouterRequestBody({
    model,
    systemPrompt,
    modelInput,
    schema,
    schemaName,
    maxOutputTokens,
    reasoningEffort,
    env,
  });
  const requestedModel = requestBody.model;
  const apiKey = requireOpenRouterKey(env);

  const startedAt = performance.now();
  const response = await fetchImpl(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Metadata": "enabled",
      "X-Title": "Coursemap course importer",
      ...(getCanonicalSiteOrigin()
        ? { "HTTP-Referer": getCanonicalSiteOrigin()! }
        : {}),
    },
    body: JSON.stringify(requestBody),
    redirect: "error",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)])
      : AbortSignal.timeout(requestTimeoutMs),
  });

  const responseText = await response.text();
  let body: unknown;
  let responseWasJson = true;
  try {
    body = JSON.parse(responseText) as unknown;
  } catch {
    body = null;
    responseWasJson = false;
  }
  if (!response.ok) {
    const providerName =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "metadata" in body.error &&
      typeof body.error.metadata === "object" &&
      body.error.metadata !== null &&
      "provider_name" in body.error.metadata &&
      typeof body.error.metadata.provider_name === "string"
        ? body.error.metadata.provider_name.trim() || null
        : null;
    throw new OpenRouterRequestError(
      safeErrorMessage(body, response.status),
      response.status,
      providerName,
    );
  }

  const parsedResponse =
    typeof body === "object" && body !== null
      ? (body as OpenRouterResponse)
      : {};
  const content = responseContent(parsedResponse);
  const structured = parseStructuredContent(content, schemaName);
  const usage = parsedResponse.usage;
  const resultUsage = {
    inputTokens: nonNegativeInteger(usage?.prompt_tokens),
    outputTokens: nonNegativeInteger(usage?.completion_tokens),
    totalTokens: nonNegativeInteger(usage?.total_tokens),
    cachedInputTokens: nonNegativeInteger(
      usage?.prompt_tokens_details?.cached_tokens,
    ),
    reasoningTokens: nonNegativeInteger(
      usage?.completion_tokens_details?.reasoning_tokens,
    ),
    costUsd:
      typeof usage?.cost === "number" && usage.cost >= 0
        ? finiteNumber(usage.cost)
        : null,
  };
  const resolvedModel =
    typeof parsedResponse.model === "string" && parsedResponse.model.trim()
      ? parsedResponse.model.trim()
      : requestedModel;
  const choice = parsedResponse.choices?.[0];
  const finishReason = boundedMetadataText(choice?.finish_reason, 120);
  const nativeFinishReason = boundedMetadataText(
    choice?.native_finish_reason,
    120,
  );
  const parsedProviderError = providerError(
    parsedResponse.error ?? choice?.error,
  );
  const responseError =
    providerResponseProblem(parsedProviderError, finishReason) ??
    (responseWasJson
      ? structured.responseError
      : "OpenRouter returned a non-JSON HTTP response.");
  const generationId =
    typeof parsedResponse.id === "string" && parsedResponse.id.trim()
      ? parsedResponse.id.trim()
      : null;
  const created = nonNegativeInteger(parsedResponse.created);
  const latencyMilliseconds = Math.max(
    0,
    Math.round(performance.now() - startedAt),
  );
  const parsedRouterMetadata = routerMetadata(
    parsedResponse.openrouter_metadata,
  );

  return {
    generationId,
    requestedModel,
    resolvedModel,
    finishReason,
    nativeFinishReason,
    providerError: parsedProviderError,
    content,
    parsed: structured.parsed,
    responseError,
    responseRepair: structured.responseRepair,
    latencyMilliseconds,
    routerMetadata: parsedRouterMetadata,
    usage: resultUsage,
    responseForAudit: {
      id: generationId,
      model: resolvedModel,
      created,
      finishReason,
      nativeFinishReason,
      providerError: parsedProviderError,
      content,
      responseError,
      responseRepair: structured.responseRepair,
      rawResponseText: responseWasJson ? null : responseText.slice(0, 16_000),
      routerMetadata: parsedRouterMetadata,
      usage: resultUsage,
      latencyMilliseconds,
    },
  };
}
