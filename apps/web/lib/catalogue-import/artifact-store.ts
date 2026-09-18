import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const COURSE_IMPORT_ARTIFACT_BUCKET = "course-import-artifacts";
export const MAX_COURSE_IMPORT_ARTIFACT_BYTES = 5 * 1024 * 1024;

export type CourseImportArtifactKind =
  | "raw_html"
  | "normalised_markdown"
  | "model_input"
  | "deterministic_output"
  | "model_request"
  | "model_response"
  | "validated_json"
  | "validation_report"
  | "database_projection"
  | "change_set";

const ALLOWED_MEDIA_TYPES = new Set([
  "application/json",
  "text/html",
  "text/markdown",
  "text/plain",
]);

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  "application/json": "json",
  "text/html": "html",
  "text/markdown": "md",
  "text/plain": "txt",
};

export type StoredCourseImportArtifact = {
  bucket: typeof COURSE_IMPORT_ARTIFACT_BUCKET;
  path: string;
  mediaType: string;
  byteSize: number;
  contentSha256: string;
};

export type CourseImportArtifactLocator = StoredCourseImportArtifact;

export class CourseImportArtifactConfigurationError extends Error {
  constructor() {
    super(
      "Configure NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SECRET_KEY before running durable imports.",
    );
    this.name = "CourseImportArtifactConfigurationError";
  }
}

function safePathPart(value: string, label: string) {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new TypeError(`${label} contains an unsupported path character.`);
  }
  return trimmed;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isDuplicateStorageError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { statusCode?: unknown; message?: unknown };
  return (
    record.statusCode === "409" ||
    record.statusCode === 409 ||
    (typeof record.message === "string" &&
      /already exists|duplicate/i.test(record.message))
  );
}

function configuredStorageClient(env: NodeJS.ProcessEnv = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secretKey) throw new CourseImportArtifactConfigurationError();
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Stores an immutable content-addressed artefact. A duplicate upload is safe on
 * worker redelivery because the hash is part of the object path.
 */
export async function storeCourseImportArtifact({
  academicYear,
  runId,
  targetId,
  stage,
  kind,
  mediaType,
  body,
  client = configuredStorageClient(),
}: {
  academicYear: number;
  runId: string;
  targetId: string;
  stage: string;
  kind: CourseImportArtifactKind;
  mediaType: string;
  body: string | Uint8Array;
  client?: SupabaseClient;
}): Promise<StoredCourseImportArtifact> {
  if (
    !Number.isInteger(academicYear) ||
    academicYear < 2000 ||
    academicYear > 2200
  ) {
    throw new TypeError(
      "academicYear must be an integer between 2000 and 2200.",
    );
  }
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    throw new TypeError(
      `Unsupported course import artefact media type: ${mediaType}`,
    );
  }

  const bytes = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  if (bytes.byteLength > MAX_COURSE_IMPORT_ARTIFACT_BYTES) {
    throw new RangeError("The course import artefact exceeds the 5 MiB limit.");
  }

  const contentSha256 = sha256(bytes);
  const extension = EXTENSION_BY_MEDIA_TYPE[mediaType]!;
  const path = [
    String(academicYear),
    safePathPart(runId, "runId"),
    safePathPart(targetId, "targetId"),
    safePathPart(stage, "stage"),
    `${safePathPart(kind, "kind")}-${contentSha256}.${extension}`,
  ].join("/");

  const { error } = await client.storage
    .from(COURSE_IMPORT_ARTIFACT_BUCKET)
    .upload(path, bytes, {
      cacheControl: "31536000",
      contentType: mediaType,
      upsert: false,
    });
  if (error && !isDuplicateStorageError(error)) throw error;

  return {
    bucket: COURSE_IMPORT_ARTIFACT_BUCKET,
    path,
    mediaType,
    byteSize: bytes.byteLength,
    contentSha256,
  };
}

/**
 * Reads an immutable private artefact and verifies it against the database
 * metadata before a retried worker trusts the contents.
 */
export async function readCourseImportArtifact({
  artifact,
  client = configuredStorageClient(),
}: {
  artifact: CourseImportArtifactLocator;
  client?: SupabaseClient;
}) {
  if (artifact.bucket !== COURSE_IMPORT_ARTIFACT_BUCKET) {
    throw new TypeError(
      "The course import artefact uses an unexpected bucket.",
    );
  }
  if (!ALLOWED_MEDIA_TYPES.has(artifact.mediaType)) {
    throw new TypeError(
      `Unsupported course import artefact media type: ${artifact.mediaType}`,
    );
  }

  const { data, error } = await client.storage
    .from(artifact.bucket)
    .download(artifact.path);
  if (error) throw error;
  if (!data) throw new Error("The course import artefact was not downloaded.");

  const bytes = new Uint8Array(await data.arrayBuffer());
  if (
    bytes.byteLength !== artifact.byteSize ||
    sha256(bytes) !== artifact.contentSha256
  ) {
    throw new Error("The course import artefact failed its integrity check.");
  }
  return Buffer.from(bytes).toString("utf8");
}
