import { validEnrolmentMode } from "@/lib/academic/enrolment-mode";
import type {
  AppState,
  Attempt,
  AttemptStatus,
  Profile,
} from "@/lib/coursemap/types";

/**
 * A guest's plan lives in cookies rather than the database, so the server can
 * render it like an account's plan and hand it over when the guest signs up.
 * The first cookie carries the chunk count; long plans continue in
 * "coursemap-guest-1" and so on, keeping each cookie under the 4 KB limit.
 */
export const GUEST_PLAN_COOKIE = "coursemap-guest";
const CHUNK_LENGTH = 3800;
export const GUEST_PLAN_MAX_CHUNKS = 4;
const MAX_ATTEMPTS = 120;
const MAX_LIST = 40;
/** A year a guest cookie lasts without being touched. */
export const GUEST_PLAN_MAX_AGE = 60 * 60 * 24 * 365;

export function guestPlanChunkName(index: number) {
  return index === 0 ? GUEST_PLAN_COOKIE : `${GUEST_PLAN_COOKIE}-${index}`;
}

const STATUS_CODES: Record<AttemptStatus, string> = {
  planned: "p",
  completed: "c",
  failed: "f",
  enrolled: "e",
  withdrawn: "w",
};
const STATUS_BY_CODE = new Map(
  Object.entries(STATUS_CODES).map(([status, code]) => [
    code,
    status as AttemptStatus,
  ]),
);

/** Field names are short because every byte counts against the cookie limit. */
type StoredGuestPlan = {
  v: 1;
  p: {
    n: string;
    /** Preferred name and pronouns, omitted while blank. */
    pn?: string;
    pr?: string;
    s: string;
    c: number;
    k: number;
    d: string;
    m: string;
    mi: string[];
    sp: string[];
    l: "f" | "p";
    e: string | null;
    x: number;
  };
  /** [id, course code, term id, academic year, status, mark, units attempted] */
  a: [string, string, string, number, string, number?, number?][];
  /** [course code, structure code, requirement key] */
  pl: [string, string, string][];
  st: string[];
};

export function emptyGuestState(year = new Date().getFullYear()): AppState {
  return {
    schemaVersion: 1,
    profile: {
      name: "",
      studentId: "",
      email: "",
      commencementYear: year,
      catalogueYear: year,
      degreeCode: "",
      majorCode: "",
      minorCodes: [],
      specialisationCodes: [],
      studyLoad: "Full time",
      extensionYears: 0,
    },
    attempts: [],
    placements: [],
    starredCourses: [],
  };
}

function toStored(state: AppState): StoredGuestPlan {
  const { profile } = state;
  return {
    v: 1,
    p: {
      n: profile.name,
      ...(profile.preferredName ? { pn: profile.preferredName } : {}),
      ...(profile.pronouns ? { pr: profile.pronouns } : {}),
      s: profile.studentId,
      c: profile.commencementYear,
      k: profile.catalogueYear,
      d: profile.degreeCode,
      m: profile.majorCode,
      mi: profile.minorCodes,
      sp: profile.specialisationCodes,
      l: profile.studyLoad === "Part time" ? "p" : "f",
      e: profile.enrolmentMode ?? null,
      x: profile.extensionYears,
    },
    a: state.attempts.map((attempt) => {
      const row: StoredGuestPlan["a"][number] = [
        attempt.id,
        attempt.courseCode,
        attempt.termId,
        attempt.academicYear ?? 0,
        STATUS_CODES[attempt.status],
      ];
      if (attempt.mark !== undefined || attempt.unitsAttempted !== undefined)
        row.push(attempt.mark ?? -1);
      if (attempt.unitsAttempted !== undefined)
        row.push(attempt.unitsAttempted);
      return row;
    }),
    pl: (state.placements ?? []).map((choice) => [
      choice.courseCode,
      choice.structureCode,
      choice.requirementKey,
    ]),
    st: state.starredCourses ?? [],
  };
}

const CODE = /^[A-Za-z0-9_-]{1,32}$/u;
const TERM = /^(?:\d{4}-[a-z0-9-]{1,16}|unscheduled)$/u;

function text(value: unknown, limit = 120) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}
function year(value: unknown, fallback: number) {
  return Number.isInteger(value) &&
    (value as number) >= 1990 &&
    (value as number) <= 2100
    ? (value as number)
    : fallback;
}
function codes(value: unknown) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string =>
              typeof item === "string" && CODE.test(item),
          ),
        ),
      ].slice(0, MAX_LIST)
    : [];
}

/**
 * Rebuilds the plan from whatever the cookie holds. The cookie is under the
 * visitor's control, so every field is checked and anything malformed is
 * dropped rather than trusted.
 */
function fromStored(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const stored = raw as Partial<StoredGuestPlan>;
  if (stored.v !== 1 || !stored.p || typeof stored.p !== "object") return null;
  const base = emptyGuestState();
  const p = stored.p;
  const profile: Profile = {
    ...base.profile,
    name: text(p.n),
    ...(text(p.pn) ? { preferredName: text(p.pn, 80) } : {}),
    ...(text(p.pr) ? { pronouns: text(p.pr, 40) } : {}),
    studentId: text(p.s, 16),
    commencementYear: year(p.c, base.profile.commencementYear),
    catalogueYear: year(p.k, base.profile.catalogueYear),
    degreeCode: CODE.test(text(p.d)) ? text(p.d) : "",
    majorCode: CODE.test(text(p.m)) ? text(p.m) : "",
    minorCodes: codes(p.mi),
    specialisationCodes: codes(p.sp),
    studyLoad: p.l === "p" ? "Part time" : "Full time",
    enrolmentMode: validEnrolmentMode(p.e) ? p.e : null,
    extensionYears:
      Number.isInteger(p.x) && (p.x as number) >= 0 && (p.x as number) <= 10
        ? (p.x as number)
        : 0,
  };
  const seen = new Set<string>();
  const attempts: Attempt[] = (Array.isArray(stored.a) ? stored.a : [])
    .slice(0, MAX_ATTEMPTS)
    .flatMap((row) => {
      if (!Array.isArray(row)) return [];
      const [id, courseCode, termId, academicYear, statusCode, mark, units] =
        row;
      const status = STATUS_BY_CODE.get(text(statusCode, 1));
      if (
        typeof id !== "string" ||
        !CODE.test(id) ||
        seen.has(id) ||
        typeof courseCode !== "string" ||
        !CODE.test(courseCode) ||
        typeof termId !== "string" ||
        !TERM.test(termId) ||
        !status
      )
        return [];
      seen.add(id);
      const attempt: Attempt = { id, courseCode, termId, status };
      const recordedYear = year(academicYear, 0);
      if (recordedYear) attempt.academicYear = recordedYear;
      if (typeof mark === "number" && mark >= 0 && mark <= 100)
        attempt.mark = mark;
      if (typeof units === "number" && units >= 0 && units <= 48) {
        attempt.unitsAttempted = units;
        attempt.unitsEarned = status === "completed" ? units : 0;
      }
      return [attempt];
    });
  const placements = (Array.isArray(stored.pl) ? stored.pl : [])
    .slice(0, MAX_LIST)
    .flatMap((row) =>
      Array.isArray(row) &&
      row.length === 3 &&
      row.every((part) => typeof part === "string" && part.length <= 200) &&
      CODE.test(row[0]) &&
      CODE.test(row[1])
        ? [
            {
              courseCode: row[0],
              structureCode: row[1],
              requirementKey: row[2],
            },
          ]
        : [],
    );
  return {
    schemaVersion: 1,
    profile,
    attempts,
    placements,
    starredCourses: codes(stored.st),
  };
}

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string) {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

/**
 * The plan as cookie values, first cookie first. Returns null when the plan
 * is too large for the cookies a browser will keep.
 */
export function encodeGuestPlan(state: AppState): string[] | null {
  const encoded = toBase64Url(JSON.stringify(toStored(state)));
  const chunks: string[] = [];
  for (let index = 0; index < encoded.length; index += CHUNK_LENGTH) {
    chunks.push(encoded.slice(index, index + CHUNK_LENGTH));
  }
  if (chunks.length === 0) chunks.push("");
  if (chunks.length > GUEST_PLAN_MAX_CHUNKS) return null;
  chunks[0] = `${chunks.length}.${chunks[0]}`;
  return chunks;
}

/** Reads the plan back through a cookie lookup; null when there is none. */
export function decodeGuestPlan(
  read: (name: string) => string | undefined,
): AppState | null {
  const first = read(GUEST_PLAN_COOKIE);
  if (!first) return null;
  const match = /^(\d)\.([A-Za-z0-9_-]*)$/u.exec(first);
  if (!match) return null;
  const count = Number(match[1]);
  if (count < 1 || count > GUEST_PLAN_MAX_CHUNKS) return null;
  let encoded = match[2];
  for (let index = 1; index < count; index += 1) {
    const chunk = read(guestPlanChunkName(index));
    if (chunk === undefined) return null;
    encoded += chunk;
  }
  try {
    return fromStored(JSON.parse(fromBase64Url(encoded)));
  } catch {
    return null;
  }
}

/** A fresh id for a guest's course, unique within their plan. */
export function guestAttemptId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
