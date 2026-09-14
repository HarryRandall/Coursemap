import type { CourseSnapshotProjectionData as Projection } from "@/lib/course-import/project-snapshot";

export type CourseReviewField = {
  key: string;
  label: string;
  kind?: "number" | "long" | "choice" | "boolean";
  options?: string[];
  required?: boolean;
};
export type CourseReviewSection = {
  key: string;
  title: string;
  fields: CourseReviewField[];
  collection?: keyof Projection;
  emptyRow?: Record<string, unknown>;
};
export const courseReviewSections: CourseReviewSection[] = [
  {
    key: "overview",
    title: "Overview",
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "subjectCode", label: "Subject code", required: true },
      { key: "subjectName", label: "Subject name" },
      { key: "level", label: "Level", kind: "number", required: true },
      {
        key: "academicCareer",
        label: "Academic career",
        kind: "choice",
        options: ["UGRD", "PGRD", "RSCH", "OTHER"],
      },
      { key: "school", label: "School" },
      { key: "college", label: "College" },
      { key: "introduction", label: "Introduction", kind: "long" },
      { key: "description", label: "Description", kind: "long" },
    ],
  },
  {
    key: "teaching",
    title: "Teaching and workload",
    fields: [
      { key: "convenerText", label: "Convenor" },
      { key: "deliverySummary", label: "Delivery" },
      { key: "workloadText", label: "Workload", kind: "long" },
      { key: "workloadHours", label: "Workload hours", kind: "number" },
      {
        key: "inherentRequirements",
        label: "Inherent requirements",
        kind: "long",
      },
      { key: "prescribedTexts", label: "Prescribed texts", kind: "long" },
    ],
  },
  {
    key: "units",
    title: "Units and availability",
    fields: [
      {
        key: "unitValueKind",
        label: "Unit value",
        kind: "choice",
        options: ["fixed", "range", "variable", "unknown"],
      },
      { key: "units", label: "Fixed units", kind: "number" },
      { key: "minimumUnits", label: "Minimum units", kind: "number" },
      { key: "maximumUnits", label: "Maximum units", kind: "number" },
      { key: "eftsl", label: "EFTSL", kind: "number" },
      {
        key: "offeringStatus",
        label: "Availability",
        kind: "choice",
        options: ["offered", "not_offered", "unknown"],
      },
    ],
  },
  {
    key: "outcomes",
    title: "Learning outcomes",
    collection: "learningOutcomes",
    emptyRow: { body: "" },
    fields: [{ key: "body", label: "Outcome", kind: "long", required: true }],
  },
  {
    key: "assessment",
    title: "Assessment",
    collection: "assessmentItems",
    emptyRow: {
      title: "",
      weight: null,
      hurdle: null,
      dueText: null,
      sourceText: "",
    },
    fields: [
      { key: "title", label: "Assessment", kind: "long", required: true },
      { key: "weight", label: "Weight (%)", kind: "number" },
      { key: "dueText", label: "Due" },
      { key: "hurdle", label: "Hurdle", kind: "boolean" },
    ],
  },
  {
    key: "attributes",
    title: "Attributes",
    collection: "attributes",
    emptyRow: {
      attributeKind: "graduate_attribute",
      value: "",
      sourceText: "",
    },
    fields: [
      { key: "value", label: "Attribute", required: true },
      { key: "attributeKind", label: "Kind" },
    ],
  },
  {
    key: "areas",
    title: "Areas of interest",
    collection: "areasOfInterest",
    emptyRow: { name: "" },
    fields: [{ key: "name", label: "Area", required: true }],
  },
  {
    key: "offerings",
    title: "Offerings",
    collection: "offeringSessions",
    fields: [
      { key: "academicPeriodName", label: "Session", required: true },
      { key: "deliveryMode", label: "Delivery" },
      { key: "location", label: "Location" },
      { key: "classNumber", label: "Class number" },
      { key: "classSummaryUrl", label: "Class summary URL" },
      { key: "startsOn", label: "Starts" },
      { key: "enrolClosesOn", label: "Enrolment closes" },
      { key: "censusOn", label: "Census" },
      { key: "endsOn", label: "Ends" },
    ],
  },
  {
    key: "fees",
    title: "Fees",
    collection: "fees",
    fields: [
      { key: "audience", label: "Audience" },
      { key: "feeType", label: "Fee type" },
      { key: "amount", label: "Amount", kind: "number" },
      { key: "currency", label: "Currency" },
      { key: "basis", label: "Basis" },
      { key: "feeYear", label: "Year", kind: "number" },
    ],
  },
  {
    key: "related",
    title: "Related courses",
    collection: "relatedCourses",
    fields: [
      { key: "sourceCourseCode", label: "Course code" },
      { key: "sourceCourseTitle", label: "Title" },
      { key: "relationKind", label: "Relationship" },
    ],
  },
];

export function courseSectionValue(
  section: CourseReviewSection,
  projection: Projection,
) {
  if (section.collection) return projection[section.collection];
  return Object.fromEntries(
    section.fields.map((field) => [
      field.key,
      projection.snapshot[field.key as keyof Projection["snapshot"]],
    ]),
  );
}

export function courseSectionFingerprint(key: string, projection: Projection) {
  if (key === "requisites")
    return JSON.stringify([
      projection.rules,
      projection.ruleGroups,
      projection.ruleConditions,
      projection.ruleConditionCourses,
    ]);
  const section = courseReviewSections.find((section) => section.key === key);
  return section
    ? JSON.stringify([
        courseSectionValue(section, projection),
        key === "units" ? projection.unitOptions : null,
        key === "offerings" ? projection.courseOffering : null,
        key === "assessment" || key === "outcomes"
          ? projection.assessmentOutcomes
          : null,
      ])
    : "";
}

export function courseReviewIssueSection(fieldPath: string) {
  const normalise = (value: string) =>
    value.replace(/[^a-z0-9]/giu, "").toLowerCase();
  const path = normalise(fieldPath);
  if (/rule|requisite|incompatib|permission|assumedknowledge/u.test(path))
    return "requisites";
  if (/unitoption/u.test(path)) return "units";
  if (/assessmentoutcome/u.test(path)) return "assessment";
  if (/courseoffering/u.test(path)) return "offerings";
  return (
    courseReviewSections.find(
      (section) =>
        (section.collection && path.includes(normalise(section.collection))) ||
        section.fields.some((field) => path.includes(normalise(field.key))),
    )?.key ?? "overview"
  );
}
