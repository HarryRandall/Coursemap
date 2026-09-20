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
    title: string | null;
    status: string;
    changeKind: string | null;
    attemptCount: number;
    errorCode: string | null;
    errorMessage: string | null;
    candidateSnapshotId: number | null;
    appliedSnapshotId: number | null;
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
    finishReason: string | null;
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

/** Reviewer-facing names for the field paths recorded by the import diff. */
export const FIELD_LABELS: Record<string, string> = {
  "course.details.title": "Title",
  "course.details.unitValueKind": "Unit value kind",
  "course.details.units": "Units",
  "course.details.minimumUnits": "Minimum units",
  "course.details.maximumUnits": "Maximum units",
  "course.details.eftsl": "EFTSL",
  "course.details.level": "Level",
  "course.details.subjectCode": "Subject code",
  "course.details.subjectName": "Subject",
  "course.details.school": "School",
  "course.details.college": "College",
  "course.details.academicCareer": "Academic career",
  "course.details.convenerText": "Convener",
  "course.details.deliverySummary": "Delivery",
  "course.details.introduction": "Introduction",
  "course.details.description": "Description",
  "course.details.workloadText": "Workload",
  "course.details.workloadHours": "Workload hours",
  "course.details.inherentRequirements": "Inherent requirements",
  "course.details.prescribedTexts": "Prescribed texts",
  "course.details.offeringStatus": "Offering status",
  "course.details.sourceUpdatedAt": "Source updated",
  "course.unitOptions": "Unit options",
  "course.fees": "Fees",
  "course.areasOfInterest": "Areas of interest",
  "course.attributes": "Attributes",
  "course.relatedCourses": "Related courses",
  "course.offering": "Offering",
  "course.sessions": "Sessions",
  "course.learningOutcomes": "Learning outcomes",
  "course.assessmentItems": "Assessment",
  "course.assessmentOutcomes": "Assessment to outcome links",
  "structure.details.name": "Name",
  "structure.details.acronym": "Acronym",
  "structure.details.shortName": "Short name",
  "structure.details.introduction": "Introduction",
  "structure.details.description": "Description",
  "structure.details.units": "Units",
  "structure.details.durationYears": "Duration (years)",
  "structure.details.academicCareer": "Academic career",
  "structure.details.college": "College",
  "structure.details.modeOfDelivery": "Mode of delivery",
  "structure.details.selectionRank": "Selection rank",
  "structure.details.atar": "ATAR",
  "structure.details.canCombine": "Can combine",
  "structure.details.canCombineVertical": "Can combine (vertical)",
  "structure.details.studyAs": "Study as",
  "structure.details.contactText": "Contact",
  "structure.sections": "Sections",
  "structure.learningOutcomes": "Learning outcomes",
  "structure.fees": "Fees",
  "structure.relationships": "Related structures",
  "requirements.prerequisite": "Prerequisites",
  "requirements.corequisite": "Corequisites",
  "requirements.incompatibility": "Incompatibilities",
  "requirements.permission": "Permission",
  "requirements.assumed_knowledge": "Assumed knowledge",
  "requirements.structure": "Requirements",
};

export function fieldLabel(fieldPath: string) {
  return FIELD_LABELS[fieldPath] ?? fieldPath;
}

/**
 * A readable name for a key the label map does not carry, such as a field
 * inside a collection row. Prefer FIELD_LABELS; this is the fallback, not a
 * substitute for naming a field properly.
 */
export function humaniseKey(key: string) {
  const known = FIELD_LABELS[key];
  if (known) return known;
  const spaced = key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The import runs list is read on the server and driven from the client, so
 * its vocabulary lives here rather than beside the loader, which is
 * server-only and would pull the Supabase client into the browser bundle.
 */
export const IMPORT_RUN_SORTS = [
  "newest",
  "oldest",
  "records",
  "cost",
] as const;
export type ImportRunSort = (typeof IMPORT_RUN_SORTS)[number];
export const DEFAULT_IMPORT_RUN_SORT: ImportRunSort = "newest";

export const IMPORT_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

/** A run as it appears in the list: the counters, without its target rows. */
export type ImportRunRow = Omit<ImportRunSummary, "targets">;

export type ImportRunsPage = {
  runs: ImportRunRow[];
  /** The run whose records are shown, with its targets loaded. */
  selected: ImportRunSummary | null;
  page: number;
  pageSize: number;
  total: number;
  sort: ImportRunSort;
};

export type ImportRunProgress = {
  status: string;
  targetCount: number;
  completedCount: number;
  failedCount: number;
};
