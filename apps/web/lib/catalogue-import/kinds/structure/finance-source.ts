import { load } from "cheerio";
import type { SupportingSourcePage } from "../../../catalogue-sync/kind-adapter.ts";
import {
  fetchCbeListOneMembership,
  modelsCbeListOneMembership,
} from "./cbe-list-one.ts";
import type {
  AcademicStructureExtractionReviewItem,
  AcademicStructureRequirements,
} from "./contract.ts";
import { preservesStudentManagedFundChoice } from "./smf-choice.ts";

type FinanceSourceClaim = {
  kind: string;
  code: string;
  academicYear: number;
};

function linksToCbeListOne(html: string) {
  const $ = load(html);
  return $("a[href]")
    .toArray()
    .some((link) => {
      const label = $(link).text().replace(/\s+/gu, " ").trim();
      if (!/\bList 1\b/iu.test(label)) return false;
      try {
        const url = new URL(
          $(link).attr("href") ?? "",
          "https://programsandcourses.anu.edu.au",
        );
        return (
          url.origin === "https://cbe.anu.edu.au" &&
          /\/list-1\/?/iu.test(url.pathname)
        );
      } catch {
        return false;
      }
    });
}

/** The 2024 Finance list is a separate source with its own provenance. */
export async function financeSupportingSource(
  claim: FinanceSourceClaim,
  html: string,
  signal?: AbortSignal,
): Promise<SupportingSourcePage | null> {
  if (
    claim.kind !== "programme" ||
    claim.code !== "BFINN" ||
    claim.academicYear !== 2024 ||
    !linksToCbeListOne(html)
  )
    return null;
  const list = await fetchCbeListOneMembership({ signal });
  return {
    ...list,
    sourceName: "ANU College of Business and Economics List 1",
    sourceKind: "linked_course_list",
    sourceBaseUrl: "https://cbe.anu.edu.au",
    externalKey: "CBE-LIST-1-2024",
    httpStatus: 200,
  };
}

/** Source-backed checks flag missing or conflicting model output without rewriting it. */
export function financeSourceReviewItems({
  claim,
  pageMarkdown,
  requirements,
  supportingSources,
}: {
  claim: FinanceSourceClaim;
  pageMarkdown: string;
  requirements: AcademicStructureRequirements;
  supportingSources?: readonly SupportingSourcePage[];
}): AcademicStructureExtractionReviewItem[] {
  const items: AcademicStructureExtractionReviewItem[] = [];
  if (
    supportingSources?.some(
      (source) =>
        !modelsCbeListOneMembership(requirements.rule, source.courseCodes),
    )
  )
    items.push({
      fieldKey: "requirements.rule",
      kind: "invalid",
      severity: "error",
      message:
        "The linked List 1 requirement does not contain the full verified 2024 course membership. Review it before publication.",
    });

  if (
    claim.kind === "programme" &&
    claim.code === "BFINN" &&
    claim.academicYear === 2024 &&
    /FINM3009[\s\S]*FINM3010[\s\S]*consecutive semesters/iu.test(
      pageMarkdown,
    ) &&
    !preservesStudentManagedFundChoice(requirements)
  )
    items.push({
      fieldKey: "requirements.rule",
      kind: "invalid",
      severity: "error",
      message:
        "The Student Managed Fund option must retain the ordered courses and timing in a consecutive-semester pair. Review it before publication.",
    });

  for (const source of supportingSources ?? []) {
    for (const { listedCode, linkedCode } of source.mismatchedCourseLinks) {
      items.push({
        fieldKey: "requirements.rule",
        kind: "conflict",
        severity: "error",
        message: `The linked CBE List 1 prints ${listedCode} but its ANU course link points to ${linkedCode}. Resolve the source discrepancy before publication.`,
      });
    }
  }
  return items;
}
