import { parseCourseSnapshotProjection } from "@/lib/course-import/snapshot-projection-contract";
import type { PendingCatalogueImport } from "./pending-catalogue-import";
import "server-only";
import { courseReviewSnapshotId } from "./course-review-snapshot";
import type { CourseSnapshotProjectionData } from "@/lib/course-import/project-snapshot";
import type { CourseImportArtifact } from "@/lib/coursemap/admin-course-imports";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type SnapshotRow = Database["public"]["Tables"]["course_snapshots"]["Row"];
type SourcePageRow = Database["public"]["Tables"]["course_source_pages"]["Row"];
type ImportStageRow =
  Database["public"]["Tables"]["course_import_stages"]["Row"];
type ExtractionRow = Database["public"]["Tables"]["course_extractions"]["Row"];
type FieldEvidenceRow =
  Database["public"]["Tables"]["course_snapshot_field_evidence"]["Row"];
type ReviewItemRow = Database["public"]["Tables"]["course_review_items"]["Row"];

const PUBLIC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/u;

export type AdminCourseYearOption = {
  courseYearId: number;
  draftSnapshotId: number | null;
  lifecycleStatus: string;
  publishedSnapshotId: number | null;
  year: number;
};

export type AdminCourseSnapshotOption = {
  publicId?: string;
  createdAt: string;
  id: number;
  origin: string;
  sealedAt: string | null;
  snapshotNumber: number;
};

export type AdminCourseYearRecord = {
  artifacts: CourseImportArtifact[];
  activeSnapshotId: number | null;
  availableYears: AdminCourseYearOption[];
  blockingReviewItems: ReviewItemRow[];
  code: string;
  courseId: number;
  courseYearId: number;
  currentSnapshotId: number | null;
  draftSnapshotId: number | null;
  evidence: FieldEvidenceRow[];
  importTarget: {
    extractions: ExtractionRow[];
    runId: string;
    stages: ImportStageRow[];
    targetId: string;
  } | null;
  lifecycleStatus: string;
  pendingImports: PendingCatalogueImport[];
  projection: CourseSnapshotProjectionData | null;
  publicId: string;
  publishedProjection: CourseSnapshotProjectionData | null;
  publishedSnapshotId: number | null;
  snapshot: SnapshotRow | null;
  sourcePage: SourcePageRow | null;
  sourceOriginalProjection: CourseSnapshotProjectionData | null;
  snapshotHistory: AdminCourseSnapshotOption[];
  year: number;
};

export async function loadCourseSnapshotProjection(
  snapshot: SnapshotRow,
  courseCode: string,
  year: number,
): Promise<CourseSnapshotProjectionData> {
  const client = await createClient();
  const { data, error } = await client.rpc("admin_catalogue_projection", {
    p_kind: "course",
    p_snapshot_id: snapshot.id,
  });
  if (error) throw error;
  const projection = parseCourseSnapshotProjection(data);
  if (projection.courseCode !== courseCode || projection.academicYear !== year)
    throw new Error("The version does not belong to this record.");
  return projection;
}

export async function loadAdminCourseYear(
  identifier: string,
  requestedYear?: number,
  includeImportArtifacts = false,
  requestedSnapshotId?: number,
): Promise<AdminCourseYearRecord | null> {
  const value = identifier.trim();
  const publicId = PUBLIC_ID_PATTERN.test(value) ? value : null;
  const code = publicId ? null : value.toUpperCase();
  if (!publicId && !COURSE_CODE_PATTERN.test(code ?? "")) return null;

  const supabase = await createClient();
  const courseQuery = supabase.from("courses").select("id,code,public_id");
  const { data: course, error: courseError } = publicId
    ? await courseQuery.eq("public_id", publicId).maybeSingle()
    : await courseQuery.eq("code", code!).maybeSingle();
  if (courseError) throw courseError;
  if (!course) return null;

  const { data: courseYears, error: courseYearsError } = await supabase
    .from("course_years")
    .select("*")
    .eq("course_id", course.id);
  if (courseYearsError) throw courseYearsError;
  if (!courseYears?.length) return null;
  const academicYearIds = [
    ...new Set(courseYears.map((courseYear) => courseYear.academic_year_id)),
  ];
  const { data: academicYears, error: academicYearsError } = await supabase
    .from("academic_years")
    .select("id,year")
    .in("id", academicYearIds);
  if (academicYearsError) throw academicYearsError;
  const academicYearById = new Map(
    (academicYears ?? []).map((academicYear) => [
      academicYear.id,
      academicYear.year,
    ]),
  );
  const availableYears = courseYears
    .flatMap((courseYear) => {
      const year = academicYearById.get(courseYear.academic_year_id);
      return year === undefined
        ? []
        : [
            {
              courseYearId: courseYear.id,
              draftSnapshotId: courseYear.draft_snapshot_id,
              lifecycleStatus: courseYear.lifecycle_status,
              publishedSnapshotId: courseYear.published_snapshot_id,
              year,
            },
          ];
    })
    .sort((left, right) => right.year - left.year);
  const selectedYear =
    availableYears.find((option) => option.year === requestedYear) ??
    availableYears[0];
  if (!selectedYear) return null;
  const { data: pendingTargets, error: pendingError } = await supabase
    .from("course_import_targets")
    .select(
      "id,run_id,candidate_snapshot_id,baseline_draft_snapshot_id,baseline_published_snapshot_id,review_status,created_at",
    )
    .eq("course_year_id", selectedYear.courseYearId)
    .eq("processing_status", "ready_for_review")
    .eq("review_status", "pending")
    .not("candidate_snapshot_id", "is", null)
    .order("created_at", { ascending: false });
  if (pendingError) throw pendingError;

  const activeSnapshotId =
    selectedYear.draftSnapshotId ?? selectedYear.publishedSnapshotId;
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("course_snapshots")
    .select("*")
    .eq("course_year_id", selectedYear.courseYearId)
    .order("snapshot_number", { ascending: false });
  if (snapshotsError) throw snapshotsError;
  const snapshotById = new Map(
    (snapshots ?? []).map((snapshot) => [snapshot.id, snapshot]),
  );
  const currentSnapshotId = courseReviewSnapshotId({
    requestedSnapshotId,
    activeSnapshotId,
    availableSnapshotIds: [...snapshotById.keys()],
    pendingSnapshotIds: (pendingTargets ?? []).flatMap((target) =>
      target.candidate_snapshot_id === null
        ? []
        : [target.candidate_snapshot_id],
    ),
  });
  const snapshot =
    currentSnapshotId === null
      ? null
      : (snapshotById.get(currentSnapshotId) ?? null);
  const publishedSnapshot =
    selectedYear.publishedSnapshotId === null
      ? null
      : (snapshotById.get(selectedYear.publishedSnapshotId) ?? null);
  const ancestrySnapshotIds: number[] = [];
  let ancestryCursor = snapshot;
  const seenSnapshotIds = new Set<number>();
  while (ancestryCursor && !seenSnapshotIds.has(ancestryCursor.id)) {
    seenSnapshotIds.add(ancestryCursor.id);
    ancestrySnapshotIds.push(ancestryCursor.id);
    ancestryCursor = ancestryCursor.based_on_snapshot_id
      ? (snapshotById.get(ancestryCursor.based_on_snapshot_id) ?? null)
      : null;
  }
  const currentDraftAncestry = new Set<number>();
  let draftAncestor =
    selectedYear.draftSnapshotId === null
      ? undefined
      : snapshotById.get(selectedYear.draftSnapshotId);
  while (draftAncestor && !currentDraftAncestry.has(draftAncestor.id)) {
    currentDraftAncestry.add(draftAncestor.id);
    draftAncestor =
      draftAncestor.based_on_snapshot_id === null
        ? undefined
        : snapshotById.get(draftAncestor.based_on_snapshot_id);
  }
  const [projection, publishedProjection] = await Promise.all([
    snapshot
      ? loadCourseSnapshotProjection(snapshot, course.code, selectedYear.year)
      : null,
    publishedSnapshot && publishedSnapshot.id !== snapshot?.id
      ? loadCourseSnapshotProjection(
          publishedSnapshot,
          course.code,
          selectedYear.year,
        )
      : null,
  ]);

  // Imported snapshots are immutable. An edited descendant must never become
  // the fallback labelled as ANU's original wording.
  const originalImportSnapshot = ancestrySnapshotIds
    .map((id) => snapshotById.get(id))
    .find((ancestor) => ancestor?.origin === "import");
  const sourceOriginalProjection = originalImportSnapshot
    ? originalImportSnapshot.id === snapshot?.id
      ? projection
      : await loadCourseSnapshotProjection(
          originalImportSnapshot,
          course.code,
          selectedYear.year,
        )
    : null;

  const [sourceResult, evidenceResult, blockingReviewsResult] =
    await Promise.all([
      snapshot?.source_page_id
        ? supabase
            .from("course_source_pages")
            .select("*")
            .eq("id", snapshot.source_page_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      snapshot
        ? supabase
            .from("course_snapshot_field_evidence")
            .select("*")
            .eq("course_snapshot_id", snapshot.id)
            .order("field_key")
        : Promise.resolve({ data: [], error: null }),
      ancestrySnapshotIds.length > 0
        ? supabase
            .from("course_review_items")
            .select("*")
            .in("course_snapshot_id", ancestrySnapshotIds)
            .eq("status", "open")
            .eq("is_blocking", true)
            .order("created_at")
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (sourceResult.error) throw sourceResult.error;
  if (evidenceResult.error) throw evidenceResult.error;
  if (blockingReviewsResult.error) throw blockingReviewsResult.error;

  let importTarget: AdminCourseYearRecord["importTarget"] = null;
  let artifacts: CourseImportArtifact[] = [];
  if (includeImportArtifacts && ancestrySnapshotIds.length > 0) {
    const { data: target, error: targetError } = await supabase
      .from("course_import_targets")
      .select("id,run_id")
      .eq("course_year_id", selectedYear.courseYearId)
      .in("candidate_snapshot_id", ancestrySnapshotIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (targetError) throw targetError;
    if (target) {
      const [artifactsResult, stagesResult, extractionsResult] =
        await Promise.all([
          supabase
            .from("course_import_artifacts")
            .select("*")
            .eq("target_id", target.id)
            .order("attempt_number", { ascending: false }),
          supabase
            .from("course_import_stages")
            .select("*")
            .eq("target_id", target.id)
            .order("position"),
          supabase
            .from("course_extractions")
            .select("*")
            .eq("target_id", target.id)
            .order("extraction_number", { ascending: false }),
        ]);
      const importDetailError = [
        artifactsResult,
        stagesResult,
        extractionsResult,
      ].find((result) => result.error)?.error;
      if (importDetailError) throw importDetailError;
      importTarget = {
        extractions: extractionsResult.data ?? [],
        runId: target.run_id,
        stages: stagesResult.data ?? [],
        targetId: target.id,
      };
      const artifactRows = artifactsResult.data;
      artifacts = (artifactRows ?? []).map((artifact) => ({
        id: artifact.id,
        kind: artifact.artifact_kind,
        attemptNumber: artifact.attempt_number,
        mediaType: artifact.media_type,
        byteSize: artifact.byte_size,
        contentSha256: artifact.content_sha256,
        createdAt: artifact.created_at,
      }));
    }
  }

  return {
    activeSnapshotId,
    artifacts,
    availableYears,
    blockingReviewItems: blockingReviewsResult.data ?? [],
    code: course.code,
    courseId: course.id,
    courseYearId: selectedYear.courseYearId,
    currentSnapshotId,
    draftSnapshotId: selectedYear.draftSnapshotId,
    evidence: evidenceResult.data ?? [],
    importTarget,
    lifecycleStatus: selectedYear.lifecycleStatus,
    pendingImports: (pendingTargets ?? []).flatMap((target) =>
      target.candidate_snapshot_id === null
        ? []
        : [
            {
              targetId: target.id,
              runId: target.run_id,
              candidateSnapshotId: target.candidate_snapshot_id,
              isCurrentDraftSource: currentDraftAncestry.has(
                target.candidate_snapshot_id,
              ),
              baselineDraftSnapshotId: target.baseline_draft_snapshot_id,
              baselinePublishedSnapshotId:
                target.baseline_published_snapshot_id,
              reviewStatus: target.review_status,
              createdAt: target.created_at,
            },
          ],
    ),
    projection,
    publicId: course.public_id,
    publishedProjection:
      publishedSnapshot?.id === snapshot?.id ? projection : publishedProjection,
    publishedSnapshotId: selectedYear.publishedSnapshotId,
    snapshot,
    snapshotHistory: (snapshots ?? []).map((item) => ({
      createdAt: item.created_at,
      id: item.id,
      origin: item.origin,
      sealedAt: item.sealed_at,
      snapshotNumber: item.snapshot_number,
      publicId: item.public_id,
    })),
    sourcePage: sourceResult.data,
    sourceOriginalProjection,
    year: selectedYear.year,
  };
}
