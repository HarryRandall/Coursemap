import type { CatalogueContent } from "@/lib/catalogue/content";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import { courseFromDraftProjection } from "@/lib/coursemap/published-courses";
import type { Json } from "@/types/database";

/**
 * Course content in the shape `private.course_version_projection` returns, so
 * unpublished content reaches the reader through the same mapping the
 * published page uses rather than a second one that can drift from it.
 *
 * The reverse-lookup keys the database adds, such as `prerequisiteEdges`, are
 * deliberately absent: they are computed over published courses only, and
 * their absence is how the view knows the question was never asked.
 */
/**
 * The course codes a prerequisite rule names, collected as
 * `private.course_version_projection` collects `prerequisiteCodes`: from the
 * rule's references, its course conditions and its course options.
 */
function prerequisiteCodesFromWrite(write: CatalogueContent) {
  const requirements = write.requirements;
  const prerequisiteConditions = requirements.conditions.filter(
    (condition) => condition.ruleKey === "prerequisite",
  );
  const conditionKeys = new Set(
    prerequisiteConditions.map((condition) => condition.key),
  );
  return [
    ...new Set([
      ...requirements.references
        .filter((reference) => reference.ruleKey === "prerequisite")
        .map((reference) => reference.code),
      ...prerequisiteConditions.flatMap((condition) =>
        condition.kind === "course" && condition.itemCode
          ? [condition.itemCode]
          : [],
      ),
      ...requirements.options
        .filter(
          (option) =>
            option.kind === "course" && conditionKeys.has(option.conditionKey),
        )
        .map((option) => option.code),
    ]),
  ].sort();
}

function courseProjectionFromWrite(write: CatalogueContent): Json {
  const course = write.course;
  if (!course) return null;
  const requirements = write.requirements;
  return {
    courseCode: write.code,
    academicYear: write.academicYear,
    origin: "manual",
    snapshot: course.details as unknown as Json,
    unitOptions: course.unitOptions as unknown as Json,
    fees: course.fees as unknown as Json,
    areasOfInterest: course.areasOfInterest as unknown as Json,
    attributes: course.attributes as unknown as Json,
    relatedCourses: course.relatedCourses as unknown as Json,
    courseOffering: (course.offering ?? null) as unknown as Json,
    offeringSessions: course.sessions as unknown as Json,
    learningOutcomes: course.learningOutcomes as unknown as Json,
    assessmentItems: course.assessmentItems as unknown as Json,
    assessmentOutcomes: course.assessmentOutcomes as unknown as Json,
    rules: requirements.rules.map((rule) => ({
      key: rule.key,
      ruleKind: rule.key,
      hardness: rule.hardness,
      sourceText: rule.sourceText,
      reviewState: rule.reviewState,
      confidence: rule.confidence,
    })),
    ruleGroups: requirements.groups.map((group) => ({
      key: group.key,
      ruleKey: group.ruleKey,
      parentGroupKey: group.parentKey,
      operator: group.operator,
      minimumCount: group.minimumCount,
      minimumUnits: group.minimumUnits,
      maximumUnits: group.maximumUnits,
      label: group.label,
      description: group.description,
      sourceText: group.sourceText,
      position: group.position,
    })),
    ruleConditions: requirements.conditions.map((condition) => ({
      key: condition.key,
      ruleKey: condition.ruleKey,
      groupKey: condition.groupKey,
      position: condition.position,
      conditionKind: condition.kind,
      requiredCourseCode:
        condition.kind === "course" || condition.kind === "incompatible"
          ? condition.itemCode
          : null,
      requiredStructureCode:
        condition.kind === "structure" ? condition.itemCode : null,
      structureKind: condition.structureKind,
      minimumUnits: condition.minimumUnits,
      maximumUnits: condition.maximumUnits,
      minimumCount: condition.minimumCount,
      minimumMark: condition.minimumMark,
      subjectCode: condition.subjectCode,
      minimumCourseLevel: condition.minimumLevel,
      maximumCourseLevel: condition.maximumLevel,
      minimumGpa: condition.minimumGpa,
      minimumYear: condition.minimumYear,
      minimumWam: condition.minimumWam,
      tag: condition.tag,
      freeText: condition.freeText,
      courseRequirementMode: condition.requirementMode,
      hardness: condition.hardness,
      sourceText: condition.sourceText,
      reviewState: condition.reviewState,
      confidence: condition.confidence,
    })),
    ruleConditionCourses: requirements.options.map((option) => ({
      conditionKey: option.conditionKey,
      position: option.position,
      kind: option.kind,
      sourceCourseCode: option.code,
      title: option.title,
      sourceText: option.sourceText,
    })),
    ruleCourseReferences: requirements.references.map((reference) => ({
      ruleKey: reference.ruleKey,
      referencedCourseCode: reference.code,
      sourceText: reference.sourceText,
      reviewState: reference.reviewState,
      confidence: reference.confidence,
    })),
    prerequisiteCodes: prerequisiteCodesFromWrite(write),
    sourceUpdatedAt: course.details.sourceUpdatedAt,
  } as unknown as Json;
}

/** The reader's view of course content that has not been published yet. */
export function courseDetailsFromWrite(
  write: CatalogueContent,
): CourseDetails | null {
  if (write.kind !== "course") return null;
  return courseFromDraftProjection(courseProjectionFromWrite(write));
}
