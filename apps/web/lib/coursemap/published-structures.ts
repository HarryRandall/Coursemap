import {
  PUBLISHED_STRUCTURE_DETAIL_TAG,
  publishedStructureTag,
} from "./published-cache";
import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public-server";
import type { Json } from "@/types/database";
import { requirementTreeFromSource } from "@/lib/coursemap/requirement-write-tree";
import {
  REQUIREMENT_SOURCE_SECTION_KEYS,
  type StructureDetails,
  type StructureKind,
} from "@/lib/coursemap/structure-types";

const STRUCTURE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,31}$/u;
const STRUCTURE_KINDS: StructureKind[] = [
  "programme",
  "major",
  "minor",
  "specialisation",
];

type LooseRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Json | null; error: { message: string } | null }>;
};

function isRecord(
  value: Json | undefined,
): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readArray(value: Json | undefined) {
  return Array.isArray(value) ? value : [];
}
function readRecords(value: Json | undefined) {
  return readArray(value).filter(isRecord);
}
function readString(value: Json | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function readNullableString(value: Json | undefined) {
  return typeof value === "string" && value.trim() ? value : null;
}
function readNumber(value: Json | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function readNullableNumber(value: Json | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The stored requirement projection, reshaped for the shared tree adapter so
 * the published page and the import preview build the same nodes.
 */
function requirementTree(
  requirements: Json | undefined,
  optionTitles: Json | undefined,
) {
  if (!isRecord(requirements)) return null;
  const titles = isRecord(optionTitles) ? optionTitles : {};
  return requirementTreeFromSource(
    {
      groups: readRecords(requirements.ruleGroups).map((group) => ({
        key: readString(group.key),
        ruleKey: readNullableString(group.ruleKey),
        parentKey: readNullableString(group.parentGroupKey),
        label: readNullableString(group.label),
        description: readNullableString(group.description),
        operator: readString(group.operator, "all_of"),
        minimumCount: readNullableNumber(group.minimumCount),
        minimumUnits: readNullableNumber(group.minimumUnits),
        maximumUnits: readNullableNumber(group.maximumUnits),
        sourceText: readNullableString(group.sourceText),
        position: readNumber(group.position),
      })),
      conditions: readRecords(requirements.ruleConditions).map((condition) => ({
        key: readString(condition.key),
        groupKey: readString(condition.groupKey),
        position: readNumber(condition.position),
        kind: readString(condition.conditionKind, "other"),
        itemCode:
          readNullableString(condition.requiredCourseCode) ??
          readNullableString(condition.requiredStructureCode),
        structureKind: readNullableString(condition.structureKind),
        requirementMode:
          readString(condition.courseRequirementMode) ===
          "completed_or_concurrent"
            ? ("completed_or_concurrent" as const)
            : readString(condition.courseRequirementMode) === "completed"
              ? ("completed" as const)
              : null,
        minimumMark: readNullableNumber(condition.minimumMark),
        minimumUnits: readNullableNumber(condition.minimumUnits),
        maximumUnits: readNullableNumber(condition.maximumUnits),
        minimumCount: readNullableNumber(condition.minimumCount),
        subjectCode: readNullableString(condition.subjectCode),
        minimumLevel: readNullableNumber(condition.minimumCourseLevel),
        maximumLevel: readNullableNumber(condition.maximumCourseLevel),
        minimumYear: readNullableNumber(condition.minimumYear),
        minimumGpa: readNullableNumber(condition.minimumGpa),
        minimumWam: readNullableNumber(condition.minimumWam),
        tag: readNullableString(condition.tag),
        freeText: readNullableString(condition.freeText),
        sourceText: readNullableString(condition.sourceText),
      })),
      options: readRecords(requirements.ruleConditionCourses).map((option) => {
        const code = readString(option.sourceCourseCode).toUpperCase();
        return {
          conditionKey: readString(option.conditionKey),
          position: readNumber(option.position),
          kind: readString(option.kind, "course"),
          code,
          title:
            readNullableString(option.title) ??
            readNullableString(titles[code]),
        };
      }),
    },
    "structure",
  );
}

function structureFromProjection(value: Json): StructureDetails | null {
  if (!isRecord(value)) return null;
  const snapshot = isRecord(value.snapshot) ? value.snapshot : {};
  const kind = readString(value.structureKind);
  if (!STRUCTURE_KINDS.includes(kind as StructureKind)) return null;
  const requirements = requirementTree(
    value.requirements,
    value.requirementOptionTitles,
  );
  return {
    code: readString(value.structureCode).toUpperCase(),
    kind: kind as StructureKind,
    year: readNumber(value.academicYear),
    name: readString(snapshot.name, readString(value.structureCode)),
    acronym: readNullableString(snapshot.acronym),
    shortName: readNullableString(snapshot.shortName),
    introduction: readNullableString(snapshot.introduction),
    description: readNullableString(snapshot.description),
    units: readNullableNumber(snapshot.units),
    durationYears: readNullableNumber(snapshot.durationYears),
    academicCareer: readNullableString(snapshot.academicCareer),
    college: readNullableString(snapshot.college),
    modeOfDelivery: readNullableString(snapshot.modeOfDelivery),
    selectionRank: readNullableNumber(snapshot.selectionRank),
    atar: readNullableNumber(snapshot.atar),
    studyAs: readNullableString(snapshot.studyAs),
    contactText: readNullableString(snapshot.contactText),
    sections: readRecords(value.sections)
      .map((section) => ({
        position: readNumber(section.position),
        sectionKey: readString(section.sectionKey),
        heading: readString(section.heading),
        markdown: readString(section.markdown),
      }))
      .filter(
        (section) =>
          section.heading.trim().length > 0 &&
          section.markdown.trim().length > 0 &&
          // The requirement tree already carries this prose.
          (!requirements ||
            !REQUIREMENT_SOURCE_SECTION_KEYS.includes(section.sectionKey)),
      ),
    learningOutcomes: readRecords(value.learningOutcomes).map((outcome) => ({
      position: readNumber(outcome.position),
      outcomeText: readString(outcome.outcomeText),
    })),
    fees: readRecords(value.fees).map((fee) => ({
      position: readNumber(fee.position),
      feeYear: readNullableNumber(fee.feeYear),
      audience: readString(fee.audience, "other"),
      feeType: readString(fee.feeType, "other"),
      amount: readNullableNumber(fee.amount),
      currency: readNullableString(fee.currency),
      basis: readString(fee.basis, "unknown"),
      sourceLabel: readNullableString(fee.sourceLabel),
      sourceText: readNullableString(fee.sourceText),
    })),
    relationships: readRecords(value.relationships).map((relationship) => ({
      position: readNumber(relationship.position),
      relationshipKind: readString(relationship.relationshipKind, "other"),
      targetKind: readString(relationship.targetKind, "programme"),
      targetCode: readString(relationship.targetCode).toUpperCase(),
      targetTitle: readNullableString(relationship.targetTitle),
    })),
    requirements,
  };
}

/** The published structure for one code and year, or null when none is published. */
export async function loadPublishedStructure(
  code: string,
  academicYear: number,
): Promise<StructureDetails | null> {
  const normalisedCode = code.trim().toUpperCase();
  if (
    !STRUCTURE_CODE_PATTERN.test(normalisedCode) ||
    !Number.isInteger(academicYear)
  ) {
    return null;
  }
  return unstable_cache(
    async () => {
      const client = createPublicClient() as unknown as LooseRpcClient;
      const { data, error } = await client.rpc("published_structure_detail", {
        p_academic_year: academicYear,
        p_structure_code: normalisedCode,
      });
      if (error) throw new Error(error.message);
      if (!data) return null;
      return structureFromProjection(data);
    },
    ["published-structure-detail", String(academicYear), normalisedCode],
    {
      revalidate: 300,
      tags: [
        PUBLISHED_STRUCTURE_DETAIL_TAG,
        publishedStructureTag(academicYear, normalisedCode),
      ],
    },
  )();
}
