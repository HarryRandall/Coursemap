import type { RequisiteExpression } from "./requisite-summary";

export type CourseRuleReviewState = "automatic" | "review" | "verified";
export type CourseRuleHardness = "advisory" | "hard";

type CourseRuleConditionBase = {
  confidence: number;
  hardness: CourseRuleHardness;
  reviewState: CourseRuleReviewState;
  sourceText: string;
};

export type CourseRuleExpression =
  | (CourseRuleConditionBase & {
      kind: "course";
      code: string;
      minimumMark: number | null;
      requirementMode: "completed" | "completed_or_concurrent";
    })
  | (CourseRuleConditionBase & {
      kind: "incompatible";
      code: string;
    })
  | (CourseRuleConditionBase & {
      kind: "units_total" | "subject_units";
      subject: string | null;
      units: number;
    })
  | (CourseRuleConditionBase & {
      kind: "level_units";
      maximumLevel: number | null;
      minimumLevel: number;
      subject: string | null;
      units: number;
    })
  | (CourseRuleConditionBase & {
      kind: "course_set_units";
      courseCodes: string[];
      units: number;
    })
  | (CourseRuleConditionBase & {
      kind: "year_standing";
      minimumYear: number;
    })
  | (CourseRuleConditionBase & {
      kind: "structure";
      structureCode: string | null;
      text: string | null;
    })
  | (CourseRuleConditionBase & {
      kind: "structure_set";
      minimumCount: number | null;
      structureCodes: string[];
      structureKind: string | null;
    })
  | (CourseRuleConditionBase & {
      kind: "tagged_units";
      tag: string;
      units: number;
    })
  | (CourseRuleConditionBase & {
      kind: "elective_units";
      units: number;
    })
  | (CourseRuleConditionBase & {
      kind: "gpa";
      minimumGpa: number;
    })
  | (CourseRuleConditionBase & {
      kind: "wam";
      minimumWam: number;
    })
  | (CourseRuleConditionBase & {
      kind: "permission" | "other";
      text: string;
    })
  | {
      conditions: CourseRuleExpression[];
      kind: "group";
      minimumCount: number | null;
      operator: "all_of" | "any_of" | "at_least";
    };

export type CourseRequisiteRule = {
  confidence: number;
  expression: RequisiteExpression | null;
  hardness: CourseRuleHardness;
  relationalExpression: CourseRuleExpression | null;
  reviewState: CourseRuleReviewState;
  sourceText: string;
};

export type CourseUnitValue =
  | { kind: "fixed"; units: number }
  | { kind: "range"; maximumUnits: number; minimumUnits: number }
  | {
      kind: "variable" | "unknown";
      options: Array<{ label: string | null; units: number }>;
    };

export type CourseFee = {
  amount: number | null;
  audience: string;
  basis: string;
  currency: string | null;
  feeType: string;
  feeYear: number | null;
  sourceLabel: string | null;
  sourceText: string | null;
  studentContributionBand: number | null;
};

export type CourseOffering = {
  calendarYear: number;
  censusOn: string | null;
  classNumber: string | null;
  classSummaryUrl: string | null;
  deliveryMode: string | null;
  endsOn: string | null;
  enrolClosesOn: string | null;
  location: string | null;
  periodCode: string;
  periodName: string;
  startsOn: string | null;
};

export type CourseAssessment = {
  dueText: string | null;
  hurdle: boolean | null;
  learningOutcomePositions: number[];
  position: number;
  title: string;
  weight: number | null;
};

export type CourseAttribute = { kind: string; value: string };

export type CourseRelatedCourse = {
  code: string;
  kind: string;
  sourceText: string | null;
  title: string | null;
};

export type CourseDetails = {
  academicCareer: string | null;
  accent: "blue" | "violet" | "mint" | "amber" | "rose" | "cyan";
  areasOfInterest: string[];
  assessments: CourseAssessment[];
  attributes: CourseAttribute[];
  code: string;
  /** Published snapshot backing this course, when available. */
  snapshotId?: number;
  college: string | null;
  name: string;
  year: number;
  units: number;
  unitValue: CourseUnitValue;
  eftsl: number | null;
  level: number;
  subject: string;
  subjectName: string | null;
  school: string;
  convener: string;
  sessions: string[];
  offerings: CourseOffering[];
  offeringStatus: "offered" | "not_offered" | "unknown";
  delivery: string;
  introduction: string | null;
  description: string;
  workloadText: string | null;
  workloadHours: number | null;
  inherentRequirements: string | null;
  prescribedTexts: string | null;
  fees: CourseFee[];
  learningOutcomes: Array<{ body: string; position: number }>;
  relatedCourses: CourseRelatedCourse[];
  prerequisiteText: string;
  assumedKnowledgeText: string;
  corequisiteText: string;
  permissionText: string;
  prerequisiteCodes: string[];
  prerequisiteEdges: CoursePrerequisiteEdge[];
  prerequisiteRule: CourseRequisiteRule | null;
  /** Published courses which can be opened from requisite prose. */
  availableCourseCodes: string[];
  incompatibilityText: string;
  /**
   * Whether the reverse lookup for courses this one unlocks actually ran. It
   * only runs over published courses, so a draft cannot tell an empty result
   * from an unasked question and must say so rather than imply nothing.
   */
  unlocksAreKnown: boolean;
  sourceUrl: string;
  sourceUpdatedAt: string | null;
  publicationStatus: "published" | "draft";
  reviewState: "automatic" | "review" | "verified";
};

export type CoursePrerequisiteEdge = {
  from: string;
  to: string;
  fromIsAvailable: boolean;
  toIsAvailable: boolean;
};
