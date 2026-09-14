"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { canWriteCourses } from "@/lib/auth/viewer";
import type { CourseSnapshotProjectionData } from "@/lib/course-import/project-snapshot";
import { parseCourseSnapshotProjection } from "@/lib/course-import/snapshot-projection-contract";
import type { CoursemapActionResult } from "@/lib/coursemap/actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

type RpcError = { code?: string; message: string };
type SnapshotRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

export type SaveCourseSnapshotInput = {
  coursePublicId: string;
  courseYearId: number;
  expectedBaseSnapshotId: number;
  projection: CourseSnapshotProjectionData;
};

export type PublishCourseSnapshotInput = {
  code: string;
  coursePublicId: string;
  courseYearId: number;
  expectedPublishedSnapshotId: number | null;
  snapshotId: number;
  year: number;
};

export type ArchiveCourseYearInput = {
  code: string;
  coursePublicId: string;
  courseYearId: number;
  expectedDraftSnapshotId: number | null;
  expectedPublishedSnapshotId: number | null;
  year: number;
};

const PUBLIC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/u;

function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
}

function optionalPositiveId(value: number | null, label: string) {
  return value === null ? null : positiveId(value, label);
}

function identifiers(input: {
  code?: string;
  coursePublicId: string;
  year?: number;
}) {
  if (!PUBLIC_ID_PATTERN.test(input.coursePublicId)) {
    throw new TypeError("The course identifier is invalid.");
  }
  if (input.code && !COURSE_CODE_PATTERN.test(input.code)) {
    throw new TypeError("The course code is invalid.");
  }
  if (
    input.year !== undefined &&
    (!Number.isSafeInteger(input.year) ||
      input.year < 2000 ||
      input.year > 2200)
  ) {
    throw new TypeError("The academic year is invalid.");
  }
}

function actionError(error: unknown, fallback: string) {
  if (typeof error !== "object" || error === null) return fallback;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  if (code === "42501" || /permission|not authenticated/i.test(message)) {
    return "Course write permission is required.";
  }
  if (code === "40001" || /stale|changed|expected/i.test(message)) {
    return "This course changed while you were working. Refresh the page and review the current snapshot before trying again.";
  }
  if (/critical uncertainty|blocking review/i.test(message)) {
    return "Resolve the blocking review items and critical uncertainty before publishing.";
  }
  if (/archived/i.test(message)) {
    return "This course year is archived and cannot be changed.";
  }
  if (/no changes|identical|unchanged/i.test(message)) {
    return "No saved course information changed.";
  }
  if (
    code === "22023" ||
    code === "23514" ||
    /projection|invalid/i.test(message)
  ) {
    return message || "The edited course fields are not valid.";
  }
  return fallback;
}

function revalidateCourse({
  code,
  coursePublicId,
  year,
}: {
  code: string;
  coursePublicId: string;
  year: number;
}) {
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${coursePublicId}`);
  revalidatePath("/courses");
  revalidatePath(`/courses/${code}`);
  revalidatePath("/plan");
  revalidateTag("published-course-detail", "max");
  revalidateTag("published-course-years", "max");
  revalidateTag(`published-course:${year}:${code}`, "max");
  revalidateTag(`published-courses:${year}`, "max");
}

async function authorisedRpcClient(): Promise<
  SnapshotRpcClient | CoursemapActionResult
> {
  if (!(await canWriteCourses())) {
    return { ok: false, message: "Course write permission is required." };
  }
  return (await createClient()) as unknown as SnapshotRpcClient;
}

export async function saveCourseSnapshot(
  input: SaveCourseSnapshotInput,
): Promise<CoursemapActionResult> {
  try {
    const projection = parseCourseSnapshotProjection(input.projection);
    identifiers({
      code: projection.courseCode,
      coursePublicId: input.coursePublicId,
      year: projection.academicYear,
    });
    const courseYearId = positiveId(input.courseYearId, "Course year");
    const expectedBaseSnapshotId = positiveId(
      input.expectedBaseSnapshotId,
      "Base snapshot",
    );
    const client = await authorisedRpcClient();
    if ("ok" in client) return client;
    const { data, error } = await client.rpc("create_course_manual_snapshot", {
      p_course_year_id: courseYearId,
      p_expected_base_snapshot_id: expectedBaseSnapshotId,
      p_projection: projection as unknown as Json,
    });
    if (error) throw error;
    if (typeof data !== "number") {
      throw new Error("The saved snapshot identifier was not returned.");
    }
    revalidateCourse({
      code: projection.courseCode,
      coursePublicId: input.coursePublicId,
      year: projection.academicYear,
    });
    return {
      ok: true,
      snapshotId: data,
      message: `${projection.courseCode} was saved as a new draft snapshot.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: actionError(
        error,
        "Coursemap could not save this course draft.",
      ),
    };
  }
}

export async function publishCourseSnapshot(
  input: PublishCourseSnapshotInput,
): Promise<CoursemapActionResult> {
  try {
    identifiers(input);
    const courseYearId = positiveId(input.courseYearId, "Course year");
    const snapshotId = positiveId(input.snapshotId, "Draft snapshot");
    const expectedPublishedSnapshotId = optionalPositiveId(
      input.expectedPublishedSnapshotId,
      "Published snapshot",
    );
    const client = await authorisedRpcClient();
    if ("ok" in client) return client;
    const { error } = await client.rpc("publish_course_snapshot", {
      p_course_year_id: courseYearId,
      p_snapshot_id: snapshotId,
      p_expected_published_snapshot_id: expectedPublishedSnapshotId,
    });
    if (error) throw error;
    revalidateCourse(input);
    return {
      ok: true,
      message: `${input.code} is now published for ${input.year}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: actionError(error, "Coursemap could not publish this snapshot."),
    };
  }
}

export async function archiveCourseYear(
  input: ArchiveCourseYearInput,
): Promise<CoursemapActionResult> {
  try {
    identifiers(input);
    const courseYearId = positiveId(input.courseYearId, "Course year");
    const expectedDraftSnapshotId = optionalPositiveId(
      input.expectedDraftSnapshotId,
      "Draft snapshot",
    );
    const expectedPublishedSnapshotId = optionalPositiveId(
      input.expectedPublishedSnapshotId,
      "Published snapshot",
    );
    const client = await authorisedRpcClient();
    if ("ok" in client) return client;
    const { error } = await client.rpc("archive_course_year", {
      p_course_year_id: courseYearId,
      p_expected_draft_snapshot_id: expectedDraftSnapshotId,
      p_expected_published_snapshot_id: expectedPublishedSnapshotId,
    });
    if (error) throw error;
    revalidateCourse(input);
    return {
      ok: true,
      message: `${input.code} ${input.year} was archived. Its snapshots and source history were kept.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: actionError(
        error,
        "Coursemap could not archive this course year.",
      ),
    };
  }
}
