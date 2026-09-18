import type { CoursePrerequisiteEdge } from "./course-types";
import { extractAnuCourseCodes } from "./course-codes";

const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/u;

export type PrerequisiteFallbackDetail = {
  isAvailable: boolean;
  prerequisiteEdges: readonly CoursePrerequisiteEdge[];
};

export type PrerequisiteFallbackNode = PrerequisiteFallbackDetail & {
  projection: unknown;
};

const MAX_PREREQUISITE_FALLBACK_COURSES = 100;
const PREREQUISITE_FALLBACK_CONCURRENCY = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readCourseCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return COURSE_CODE_PATTERN.test(code) ? code : null;
}

/**
 * Derive prerequisite identities only from one immutable snapshot projection.
 * This deliberately does not inspect a current course year or published graph.
 */
export function prerequisiteCodesFromSnapshotProjection(projection: unknown) {
  if (!isRecord(projection)) return [];

  const codes = new Set<string>();
  for (const value of readArray(projection.prerequisiteCodes)) {
    const code = readCourseCode(value);
    if (code) codes.add(code);
  }

  const prerequisiteConditionKeys = new Set<string>();
  for (const value of readArray(projection.ruleConditions)) {
    if (!isRecord(value) || value.ruleKey !== "prerequisite") continue;
    if (typeof value.key === "string" && value.key.trim()) {
      prerequisiteConditionKeys.add(value.key);
    }
    const code = readCourseCode(value.requiredCourseCode);
    if (code) codes.add(code);
  }

  for (const value of readArray(projection.ruleConditionCourses)) {
    if (
      !isRecord(value) ||
      typeof value.conditionKey !== "string" ||
      !prerequisiteConditionKeys.has(value.conditionKey)
    ) {
      continue;
    }
    const code = readCourseCode(value.sourceCourseCode);
    if (code) codes.add(code);
  }

  for (const value of readArray(projection.ruleCourseReferences)) {
    if (!isRecord(value) || value.ruleKey !== "prerequisite") continue;
    const code = readCourseCode(value.referencedCourseCode);
    if (code) codes.add(code);
  }

  // Older snapshots can retain accurate prerequisite prose while having no
  // relational reference rows after a model-validation fallback. Exact course
  // tokens remain useful as descriptive graph links, but are not interpreted
  // as enrolment conditions here.
  for (const value of readArray(projection.rules)) {
    if (
      !isRecord(value) ||
      (value.ruleKey !== "prerequisite" &&
        value.ruleKind !== "prerequisite" &&
        value.key !== "prerequisite")
    ) {
      continue;
    }
    if (typeof value.sourceText === "string") {
      for (const code of extractAnuCourseCodes(value.sourceText)) {
        codes.add(code);
      }
    }
  }

  const currentCourseCode = readCourseCode(projection.courseCode);
  if (currentCourseCode) codes.delete(currentCourseCode);

  return [...codes].sort();
}

/**
 * Recover a complete upstream graph when older snapshots contain exact course
 * codes in source prose but no relational reference rows. Each published
 * prerequisite is inspected once, so raw-text fallbacks can continue through
 * more than one level without looping forever on malformed cyclic data.
 */
export async function resolvePrerequisiteFallbackDetails({
  courseCode,
  loadNode,
  projection,
  storedEdges,
}: {
  courseCode: string;
  loadNode: (courseCode: string) => Promise<PrerequisiteFallbackNode>;
  projection: unknown;
  storedEdges: readonly CoursePrerequisiteEdge[];
}) {
  const normalisedCourseCode = readCourseCode(courseCode);
  if (!normalisedCourseCode) return {};

  const fallbackCodes = prerequisiteCodesFromSnapshotProjection(projection);
  if (fallbackCodes.length === 0) return {};

  const pending = [...fallbackCodes];
  const queued = new Set(pending);
  const processed = new Set<string>();
  const availability = new Map<string, boolean>();
  const recoveredEdges = new Map<string, CoursePrerequisiteEdge>(
    storedEdges.map((edge) => [`${edge.from}:${edge.to}`, edge] as const),
  );
  const lexicalEdges = new Set<string>();

  while (
    pending.length > 0 &&
    processed.size < MAX_PREREQUISITE_FALLBACK_COURSES
  ) {
    const remaining = MAX_PREREQUISITE_FALLBACK_COURSES - processed.size;
    const batch = pending
      .splice(0, Math.min(PREREQUISITE_FALLBACK_CONCURRENCY, remaining))
      .filter((code) => !processed.has(code));
    for (const code of batch) processed.add(code);
    const nodes = await Promise.all(
      batch.map(async (code) => ({ code, node: await loadNode(code) })),
    );

    for (const { code: currentCode, node } of nodes) {
      availability.set(currentCode, node.isAvailable);
      for (const edge of node.prerequisiteEdges) {
        recoveredEdges.set(`${edge.from}:${edge.to}`, edge);
      }

      for (const upstreamCode of prerequisiteCodesFromSnapshotProjection(
        node.projection,
      )) {
        if (upstreamCode === currentCode) continue;
        if (
          !node.prerequisiteEdges.some(
            (edge) => edge.from === upstreamCode && edge.to === currentCode,
          )
        ) {
          lexicalEdges.add(`${upstreamCode}:${currentCode}`);
        }
        if (!queued.has(upstreamCode)) {
          pending.push(upstreamCode);
          queued.add(upstreamCode);
        }
      }
    }
  }

  for (const key of lexicalEdges) {
    const [from, to] = key.split(":");
    if (!from || !to || recoveredEdges.has(key)) continue;
    recoveredEdges.set(key, {
      from,
      to,
      fromIsAvailable: availability.get(from) ?? false,
      toIsAvailable: availability.get(to) ?? false,
    });
  }

  const prerequisiteEdges = [...recoveredEdges.values()];
  return Object.fromEntries(
    fallbackCodes.map((prerequisiteCode) => [
      prerequisiteCode,
      {
        isAvailable: availability.get(prerequisiteCode) ?? false,
        prerequisiteEdges,
      },
    ]),
  ) satisfies Record<string, PrerequisiteFallbackDetail>;
}

/**
 * Preserve the authoritative stored graph and add direct, locked edges for
 * exact prerequisite course mentions that predate descriptive references.
 */
export function prerequisiteEdgesWithSnapshotFallback({
  courseCode,
  fallbackDetails = {},
  projection,
  storedEdges,
}: {
  courseCode: string;
  fallbackDetails?: Readonly<Record<string, PrerequisiteFallbackDetail>>;
  projection: unknown;
  storedEdges: readonly CoursePrerequisiteEdge[];
}) {
  const normalisedCourseCode = readCourseCode(courseCode);
  if (!normalisedCourseCode) return [...storedEdges];

  const edges = [...storedEdges];
  const exactEdges = new Set(edges.map((edge) => `${edge.from}:${edge.to}`));
  for (const prerequisiteCode of prerequisiteCodesFromSnapshotProjection(
    projection,
  )) {
    const fallback = fallbackDetails[prerequisiteCode];
    if (fallback) {
      const pending = [prerequisiteCode];
      const seen = new Set(pending);
      while (pending.length > 0) {
        const targetCode = pending.shift()!;
        for (const edge of fallback.prerequisiteEdges) {
          if (edge.to !== targetCode) continue;
          const upstreamKey = `${edge.from}:${edge.to}`;
          if (!exactEdges.has(upstreamKey)) {
            edges.push(edge);
            exactEdges.add(upstreamKey);
          }
          if (!seen.has(edge.from)) {
            seen.add(edge.from);
            pending.push(edge.from);
          }
        }
      }
    }
    const edgeKey = `${prerequisiteCode}:${normalisedCourseCode}`;
    if (exactEdges.has(edgeKey)) continue;
    edges.push({
      from: prerequisiteCode,
      to: normalisedCourseCode,
      fromIsAvailable: fallback?.isAvailable ?? false,
      toIsAvailable: true,
    });
    exactEdges.add(edgeKey);
  }

  return edges;
}
