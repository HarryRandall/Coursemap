import { emptyAcademicStructureExtraction } from "./finalise.ts";
import type {
  AcademicStructureExtraction,
  AcademicStructureKind,
} from "./contract.ts";
import type { StructureSectionKey } from "../../../catalogue/structure-vocabulary.ts";
import { parseSubjectStructureRequirements } from "./subject-requirements.ts";
import { separateStructurePolicies } from "./source-policies.ts";
import { parsePlainStructureRequirements } from "./plain-requirements.ts";
import { structureForName, type KnownStructure } from "./known-structures.ts";

const SECTIONS: Record<string, StructureSectionKey> = {
  "Other Information": "advice",
  "Further Information": "further_information",
  "Inherent Requirements": "inherent_requirements",
  "Career Options": "careers",
  "Admission Requirements": "admission",
  "Cognate Disciplines": "admission",
};

/** Reads only labelled ANU fields. Every unrecognised section remains visible and held. */
export function readStructureSource(
  kind: AcademicStructureKind,
  code: string,
  year: number,
  markdown: string,
  knownStructures: readonly KnownStructure[] = [],
) {
  const extraction = emptyAcademicStructureExtraction({
    kind,
    code,
    year,
    title: null,
  });
  const evidence = (fieldKey: string, source: string) =>
    extraction.evidence.push({
      fieldKey,
      sourceLocator: fieldKey,
      evidenceExcerpt: source,
      confidence: 1,
      method: "deterministic",
    });
  const flag = (fieldKey: string, message: string) =>
    extraction.reviewItems.push({
      fieldKey,
      kind: "ambiguous",
      severity: "warning",
      message,
    });
  const title = markdown.match(/^# (.+)$/mu)?.[1];
  if (title) {
    extraction.title = title;
    evidence("title", title);
  } else flag("title", "The source title could not be read.");
  const units = markdown.match(/^- Total units (\d+) Units\s*$/mu);
  if (units) {
    extraction.totalUnits = Number(units[1]);
    evidence("totalUnits", units[0]);
  } else flag("totalUnits", "The source unit total could not be read.");
  const career = markdown.match(/^- Academic career (.+)$/mu);
  if (career) {
    extraction.academicCareer = career[1]!;
    evidence("academicCareer", career[0]);
  }
  const college = markdown.match(
    /^A (?:major|minor|specialisation) offered by the (.+)$/mu,
  );
  if (college) {
    extraction.college = college[1]!;
    evidence("college", college[0]);
  }
  const contact = markdown.match(/^- Academic Contact (.+)$/mu);
  if (contact) {
    extraction.contactText = contact[1]!;
    evidence("contactText", contact[0]);
  }
  const areas = markdown.match(/^- Areas of interest (.+)$/mu);
  if (areas) {
    extraction.summaryFields.push({
      position: 1,
      key: "areas_of_interest",
      label: "Areas of interest",
      values: [areas[1]!],
      sourceText: areas[0],
    });
    evidence("summaryFields", areas[0]);
  }
  const nav = markdown.match(/^- Introduction\n(?:- [^\n]+\n)*\s*/mu);
  // Some ANU structures omit Introduction and start directly at a labelled
  // Study section. Read that section without treating header furniture as prose.
  const firstSection = markdown.search(
    /^## (?:Requirements|Learning Outcomes|Other Information|Further Information|Relevant Degrees)\s*$/mu,
  );
  const body = nav
    ? markdown.slice(nav.index! + nav[0].length)
    : firstSection >= 0
      ? markdown.slice(firstSection)
      : "";
  if (!nav)
    flag("introduction", "The source page layout could not be verified.");
  const parts = body.split(/^## /mu);
  extraction.introduction = parts.shift()?.trim() || null;
  if (extraction.introduction)
    evidence("introduction", extraction.introduction);
  let requirementsText: string | null = null;
  const headings = new Set<string>();
  for (const part of parts) {
    const split = part.indexOf("\n");
    const heading = part.slice(0, split).trim();
    const text = part.slice(split + 1).trim();
    if (headings.has(heading))
      flag("sections", `The source repeats the ${heading} section.`);
    headings.add(heading);
    if (heading === "Requirements") {
      requirementsText = [requirementsText, text].filter(Boolean).join("\n\n");
      continue;
    }
    if (heading === "Areas of Interest") {
      const existing = extraction.summaryFields.find(
        (field) => field.key === "areas_of_interest",
      );
      if (existing) {
        if (!existing.values.includes(text)) existing.values.push(text);
        existing.sourceText += `\n\n${text}`;
      } else {
        extraction.summaryFields.push({
          position: extraction.summaryFields.length + 1,
          key: "areas_of_interest",
          label: "Areas of interest",
          values: [text],
          sourceText: text,
        });
      }
      evidence("summaryFields", text);
    } else if (heading === "Learning Outcomes") {
      const rows = text.split(/\n+/u).filter(Boolean);
      if (rows.some((row) => !row.startsWith("- ")))
        flag("learningOutcomes", "The learning outcome layout needs review.");
      const offset = extraction.learningOutcomes.length;
      extraction.learningOutcomes.push(
        ...rows.map((row, index) => ({
          position: offset + index + 1,
          text: row.replace(/^- /u, ""),
          sourceText: row,
          sourceLocator: heading,
        })),
      );
      if (text) evidence("learningOutcomes", text);
    } else if (heading === "Relevant Degrees") {
      const rows = text.split(/\n+/u).filter(Boolean);
      for (const row of rows) {
        const link = row.match(/^- \[([^\]]+)\]\(([A-Z0-9][A-Z0-9-]+)\)$/u);
        if (!link) {
          flag("relationships", "A related degree link needs review.");
          continue;
        }
        extraction.relationships.push({
          position: extraction.relationships.length + 1,
          relationshipKind: "offered_in",
          targetKind: "programme",
          targetCode: link[2]!,
          targetTitle: link[1]!,
          sourceText: row,
          sourceLocator: heading,
        });
      }
      if (text) evidence("relationships", text);
    } else if (text) {
      const key = SECTIONS[heading] ?? "further_information";
      const existing = extraction.sections.find(
        (section) => section.key === key,
      );
      const markdown =
        SECTIONS[heading] && heading !== "Cognate Disciplines"
          ? text
          : `### ${heading}\n\n${text}`;
      if (existing) {
        existing.markdown += `\n\n${markdown}`;
        existing.sourceText += `\n\n${text}`;
        existing.sourceLocator += `; ${heading}`;
      } else {
        extraction.sections.push({
          key,
          markdown,
          sourceText: text,
          sourceLocator: heading,
        });
      }
      evidence("sections", text);
      if (!SECTIONS[heading])
        flag("sections", `The ${heading} section needs review.`);
    }
  }
  const separated = separateStructurePolicies(requirementsText ?? "");
  if (separated.policies.length) {
    const text = separated.policies.join("\n\n");
    const existing = extraction.sections.find(
      (section) => section.key === "advice",
    );
    if (existing) {
      existing.markdown += `\n\n${text}`;
      existing.sourceText += `\n\n${text}`;
      existing.sourceLocator += "; Requirements";
    } else
      extraction.sections.push({
        key: "advice",
        markdown: text,
        sourceText: text,
        sourceLocator: "Requirements",
      });
    evidence("sections", text);
  }
  const plain =
    parsePlainStructureRequirements(
      separated.requirements,
      extraction.totalUnits,
      separated.prerequisiteMarkers,
    ) ??
    parseSubjectStructureRequirements(
      separated.requirements,
      extraction.totalUnits,
    );
  extraction.requirements = plain ?? {
    sourceText: requirementsText,
    sourceLocator: "Requirements",
    rule: null,
    unmodelledText: requirementsText ? [requirementsText] : [],
  };
  if (plain) evidence("requirements", requirementsText!);
  // Admission and enrolment policies are published as verbatim source text.
  // Completion overrides still need review because they can change the tree.
  const advice = [
    extraction.introduction,
    ...extraction.sections.map((section) => section.sourceText),
  ]
    .filter(Boolean)
    .join("\n");
  // Resolve explicit relationships when the current directory has one exact
  // identity. Unresolved policy names remain visible in their original text.
  const completionAdvice = advice.replace(
    /This (major|minor|specialisation) is incompatible with the ([^.\n]+) (major|minor|specialisation)\./giu,
    (sentence, _kind, name, targetKind) => {
      const target = structureForName(
        name,
        targetKind.toLowerCase(),
        knownStructures,
      );
      if (!target) return sentence;
      extraction.relationships.push({
        position: extraction.relationships.length + 1,
        relationshipKind: "incompatible",
        targetKind: target.kind,
        targetCode: target.code,
        targetTitle: target.name,
        sourceText: sentence,
        sourceLocator: "Other Information",
      });
      evidence("relationships", sentence);
      return "";
    },
  );
  if (
    /\b(?:substitute|double.count|counted towards|credited|topic must|must be in the field|must also complete)\b/iu.test(
      completionAdvice,
    )
  )
    flag(
      "requirements",
      "Additional completion rules outside Requirements need review. The original conditions remain visible in the catalogue text.",
    );
  if (!requirementsText)
    flag("requirements", "The source has no readable requirements section.");
  // Verify that the metadata block contains only fields this reader preserves.
  const header = markdown.slice(0, nav?.index ?? markdown.length);
  const summaryLines = header
    .split("\n")
    .filter((line) => line.startsWith("- "));
  const labels = summaryLines
    .map(
      (line) =>
        line.match(
          /^- (Total units|Areas of interest|(?:Major|Minor|Specialisation) code|Academic career|Academic Contact) /u,
        )?.[1],
    )
    .filter(Boolean);
  if (
    new Set(labels).size !== labels.length ||
    (header.match(/^# /gmu)?.length ?? 0) !== 1
  )
    flag("summaryFields", "Repeated source metadata needs review.");
  if (
    summaryLines.some(
      (line) =>
        !/^- (?:Total units |Areas of interest |(?:Major|Minor|Specialisation) code |Academic career |Academic Contact )/u.test(
          line,
        ),
    )
  )
    flag("summaryFields", "Additional source summary fields need review.");
  if (body && !extraction.reviewItems.length) evidence("sourceCoverage", body);
  return { extraction, plain, requirementsText, advice };
}

export function heldStructureRequirements(
  extraction: AcademicStructureExtraction,
) {
  const source = extraction.requirements.sourceText;
  if (!source)
    return {
      sourceText: null,
      sourceLocator: null,
      unmodelledText: [],
      rule: null,
    };
  return {
    sourceText: source,
    sourceLocator: "Requirements",
    unmodelledText: [source],
    rule: {
      type: "group" as const,
      key: "structure",
      operator: "all_of" as const,
      minimumCount: null,
      scope: "part" as const,
      title: null,
      sourceText: source,
      sourceLocator: "Requirements",
      children: [
        {
          type: "condition" as const,
          key: "unmodelled",
          conditionKind: "free_text" as const,
          minimumUnits: null,
          maximumUnits: null,
          minimumCourses: null,
          courseCodes: [],
          structureKind: null,
          structureCodes: [],
          subjectCode: null,
          minimumLevel: null,
          maximumLevel: null,
          tag: null,
          freeText: source,
          scope: "part" as const,
          includesAnyCourse: false,
          sourceText: source,
          sourceLocator: "Requirements",
        },
      ],
    },
  };
}
