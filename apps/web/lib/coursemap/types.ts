import type { CourseRequisiteRule, CourseUnitValue } from "./course-types";

export type Accent = "blue" | "violet" | "mint" | "amber" | "rose" | "cyan";

export type Course = {
  code: string;
  name: string;
  year: number;
  /** Exact immutable snapshot when this course represents recorded history. */
  snapshotId?: number;
  units: number;
  /** Published unit rules used when recording a student's actual units. */
  unitValue?: CourseUnitValue;
  level: number;
  subject: string;
  school: string;
  convener: string;
  sessions: string[];
  delivery: string;
  description: string;
  prerequisiteText: string;
  prerequisiteCodes: string[];
  prerequisiteRule?: CourseRequisiteRule | null;
  corequisiteText?: string;
  incompatibilities: string[];
  permissionText?: string;
  countsTowards: string[];
  sourceUrl: string;
  lastChanged: string;
  parseState: "Verified" | "Automatic" | "Review";
  accent: Accent;
};

export type Degree = {
  code: string;
  name: string;
  units: number | null;
  duration: number | null;
  college: string;
  description: string;
};

export type Major = {
  code: string;
  name: string;
  units: number | null;
  colour: string;
  description: string;
  courseCodes: string[];
};

export type AttemptStatus =
  "completed" | "failed" | "planned" | "enrolled" | "withdrawn";

export type Attempt = {
  academicYear?: number;
  id: string;
  courseCode: string;
  /** Exact immutable course snapshot used when this attempt was recorded. */
  snapshotId?: number;
  /** Units saved on the attempt, independent of later course publications. */
  unitsAttempted?: number;
  unitsEarned?: number;
  termId: string;
  status: AttemptStatus;
  mark?: number;
  resultCode?: string;
  permissionApproved?: boolean;
  overloadApproved?: boolean;
};

export type Term = {
  id: string;
  year: number;
  name: string;
  shortName: string;
  dates: string;
  /** ISO calendar bounds when ANU has published the academic period. */
  startsOn?: string;
  endsOn?: string;
};

export type Relation = {
  id: string;
  source: string;
  relation: string;
  target: string;
  group: string;
  hardness: "Hard" | "Advisory" | "Allocation";
  confidence: number;
  state: "Verified" | "Automatic" | "Review";
  sourceText: string;
};

export type Profile = {
  name: string;
  studentId: string;
  email: string;
  commencementYear: number;
  catalogueYear: number;
  degreeCode: string;
  majorCode: string;
  minorCodes: string[];
  specialisationCodes: string[];
  studyLoad: "Full time" | "Part time";
  extensionYears: number;
};

export type AppState = {
  schemaVersion: 1;
  profile: Profile;
  attempts: Attempt[];
};
