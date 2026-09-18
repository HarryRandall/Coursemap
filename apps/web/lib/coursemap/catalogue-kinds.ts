import type { CatalogueKind } from "@/lib/catalogue-import/snapshot-write";

export type { CatalogueKind };

export const CATALOGUE_KIND_LABELS: Record<
  CatalogueKind,
  { singular: string; plural: string; segment: string }
> = {
  course: { singular: "Course", plural: "Courses", segment: "courses" },
  programme: {
    singular: "Programme",
    plural: "Programmes",
    segment: "programmes",
  },
  major: { singular: "Major", plural: "Majors", segment: "majors" },
  minor: { singular: "Minor", plural: "Minors", segment: "minors" },
  specialisation: {
    singular: "Specialisation",
    plural: "Specialisations",
    segment: "specialisations",
  },
};

export function adminCataloguePath(kind: CatalogueKind) {
  return `/admin/${CATALOGUE_KIND_LABELS[kind].segment}`;
}

export type DirectoryWorkflowStatus =
  | "not_imported"
  | "queued"
  | "running"
  | "ready"
  | "draft"
  | "published"
  | "published_with_draft"
  | "failed";

export type CatalogueDirectoryRecord = {
  code: string;
  title: string | null;
  summary: Record<string, unknown>;
  itemYearPublicId: string | null;
  hasDraft: boolean;
  isPublished: boolean;
  workflow: DirectoryWorkflowStatus;
  latestTarget: {
    id: string;
    runId: string;
    status: string;
    changeKind: string | null;
    errorMessage: string | null;
    completedAt: string | null;
  } | null;
};

export type CatalogueDirectoryPage = {
  kind: CatalogueKind;
  academicYear: number;
  years: number[];
  status: {
    state: "never" | "refreshing" | "available" | "failed";
    refreshedAt: string | null;
    message: string | null;
    entryCount: number;
  };
  records: CatalogueDirectoryRecord[];
  total: number;
  page: number;
  pageSize: number;
  workflowCounts: Record<DirectoryWorkflowStatus, number>;
};

export type DirectoryFilter = "all" | DirectoryWorkflowStatus;

export type ImportRunSummary = {
  id: string;
  runNumber: number;
  kind: CatalogueKind;
  academicYear: number;
  status: string;
  requestedModel: string;
  targetCount: number;
  completedCount: number;
  failedCount: number;
  costUsd: number;
  createdAt: string;
  completedAt: string | null;
  targets: Array<{
    id: string;
    code: string;
    status: string;
    changeKind: string | null;
    attemptCount: number;
    errorCode: string | null;
    errorMessage: string | null;
    candidateSnapshotId: number | null;
    itemYearPublicId: string | null;
  }>;
};

export type ImportTargetDetail = {
  id: string;
  code: string;
  kind: CatalogueKind;
  status: string;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  stages: Array<{
    id: string;
    name: string;
    attemptNumber: number;
    status: string;
    startedAt: string;
    completedAt: string | null;
    errorCode: string | null;
    errorSummary: string | null;
  }>;
  artifacts: Array<{
    id: string;
    stageId: string;
    kind: string;
    attemptNumber: number;
    mediaType: string;
    byteSize: number;
  }>;
  extraction: {
    resolvedModel: string | null;
    validationStatus: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number | null;
    warningCount: number;
    errorCount: number;
    errorSummary: string | null;
  } | null;
};

export type AdminCatalogueSummary = Record<
  CatalogueKind,
  { published: number; drafts: number; identities: number }
>;
