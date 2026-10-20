import type { Attempt, Course } from "./types";

export const TD_TAG = "Transdisciplinary Problem-Solving";
export type TdDesignation = "member" | "non_member" | "unknown";
export type TdUnits = { confirmed: number; unknown: number };

/** Server-owned catalogue identity is separate from deliberate custom credit. */
export type HistoricalTdContext = {
  trustedSnapshotIds: readonly number[];
  designationByCourseYear: readonly {
    code: string;
    year: number;
    status: TdDesignation;
  }[];
  actualYearByAttemptId: Readonly<Record<string, number>>;
};

export type TdProvenance = {
  field_path: string;
  method: string;
  confidence: number | string | null;
  source_locator: string | null;
  source_excerpt: string | null;
};

export function isTdTag(tag: string) {
  return [TD_TAG.toLowerCase(), "transdisciplinary"].includes(
    tag.trim().toLowerCase(),
  );
}

function hasNativeTd(tags: readonly string[]) {
  return tags.some((tag) => tag.trim().toLowerCase() === TD_TAG.toLowerCase());
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function jsonObject(value: unknown) {
  try {
    return object(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return null;
  }
}

/** Current published facts can retain an earlier repair through unrelated clones. */
export function tdDesignationFromEvidence({
  code,
  year,
  tags,
  provenance,
}: {
  code: string;
  year: number;
  tags: readonly string[];
  provenance: readonly TdProvenance[];
}): TdDesignation {
  if (!Number.isInteger(year) || !/^[A-Z]{4}\d{4}[A-Z]?$/.test(code))
    return "unknown";
  // A removed designation cannot be resurrected by an ancestor's old evidence.
  if (!tags.some(isTdTag)) return "unknown";
  // The scoped server oracle selects the latest tag authority. Without
  // ordering metadata, multiple tag rows cannot safely choose that authority.
  const authorities = provenance.filter(
    (row) => row.field_path === "course.tags",
  );
  if (authorities.length !== 1) return "unknown";
  for (const row of authorities) {
    if (
      row.field_path !== "course.tags" ||
      row.method !== "deterministic" ||
      Number(row.confidence) !== 1
    )
      continue;
    const fact = jsonObject(row.source_excerpt);
    if (
      !fact ||
      typeof fact.sourceHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(fact.sourceHash) ||
      typeof fact.planHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(fact.planHash) ||
      typeof fact.retrievedAt !== "string" ||
      !Number.isFinite(Date.parse(fact.retrievedAt))
    )
      continue;
    try {
      const url = new URL(row.source_locator ?? "");
      if (
        url.origin !== "https://programsandcourses.anu.edu.au" ||
        url.pathname !== "/data/CourseSearch/GetCourses" ||
        url.searchParams.getAll("SelectedYear").length !== 1 ||
        url.searchParams.get("SelectedYear") !== String(year) ||
        url.searchParams.getAll("GraduateAttributes[2]").length !== 1 ||
        url.searchParams.get("GraduateAttributes[2]") !== TD_TAG
      )
        continue;
    } catch {
      continue;
    }
    if (fact.repair === "Canonical ANU transdisciplinary designation") {
      const excerpt = jsonObject(fact.sourceExcerpt);
      if (
        excerpt?.code === code &&
        excerpt.year === year &&
        excerpt.designation === TD_TAG
      )
        return "member";
    } else if (
      fact.repair ===
        "Canonical ANU transdisciplinary tag on a separately guarded legacy version" &&
      fact.code === code &&
      fact.year === year &&
      [
        "exactStoredLegacyHash",
        "exactReconstructedBeforeHash",
        "sourceProposalHash",
        "fullRawSnapshotSha256",
      ].every(
        (key) =>
          typeof fact[key] === "string" &&
          /^[a-f0-9]{64}$/.test(fact[key] as string),
      )
    ) {
      return "member";
    }
  }
  // Absence of a tag is not a verified negative membership list.
  return "unknown";
}

/** Undefined leaves planned estimates and deliberate custom/manual facts alone. */
export function effectiveTdDesignation(
  attempt: {
    attemptId: string;
    code: string;
    status: Attempt["status"];
    snapshotId?: number;
    snapshotYear?: number;
    tags?: readonly string[];
  },
  context?: HistoricalTdContext,
): TdDesignation | undefined {
  if (
    attempt.status !== "completed" ||
    !context ||
    attempt.snapshotId === undefined ||
    !context.trustedSnapshotIds.includes(attempt.snapshotId)
  )
    return undefined;
  const year = context.actualYearByAttemptId[attempt.attemptId];
  if (!Number.isInteger(year)) return "unknown";
  if (year === attempt.snapshotYear && hasNativeTd(attempt.tags ?? []))
    return "member";
  const facts = context.designationByCourseYear.filter(
    (fact) => fact.code === attempt.code && fact.year === year,
  );
  return facts.length === 1 ? facts[0].status : "unknown";
}

export function tdUnitsForDesignation(
  units: number,
  designation: TdDesignation | undefined,
  tags: readonly string[] = [],
): TdUnits {
  return {
    confirmed:
      designation === "member" ||
      (designation === undefined &&
        tags.some((tag) => tag.toLowerCase() === TD_TAG.toLowerCase()))
        ? units
        : 0,
    unknown: designation === "unknown" ? units : 0,
  };
}

export function tdDesignationForAttempt(
  attempt: Attempt,
  course: Course,
  context?: HistoricalTdContext,
) {
  return effectiveTdDesignation(
    {
      attemptId: attempt.id,
      code: attempt.courseCode,
      status: attempt.status,
      snapshotId: attempt.snapshotId,
      snapshotYear: course.year,
      tags: course.tags,
    },
    context,
  );
}
