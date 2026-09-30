import type { SyncSql } from "../../../catalogue-sync/sync-store.ts";
import { loadKnownCourseTags } from "../course/tags.ts";
import type {
  AcademicStructureExtractionReviewItem,
  AcademicStructureRequirementRule,
} from "./contract.ts";

/**
 * Tags a structure rule can count: reviewed course tags plus the course lists
 * published for the structure's year, whose names are tags too.
 */
export async function loadStructureTags(
  sql: SyncSql,
  academicYearId: number,
): Promise<string[]> {
  const [courseTags, lists] = await Promise.all([
    loadKnownCourseTags(sql),
    sql`
      select name from public.course_lists
      where academic_year_id = ${academicYearId} and published_at is not null
      order by name
    `,
  ]);
  const seen = new Set<string>();
  return [...lists.map((row) => String(row.name)), ...courseTags].filter(
    (name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  );
}

function tagConditions(
  rule: AcademicStructureRequirementRule | null,
): string[] {
  if (!rule) return [];
  if (rule.type === "group") return rule.children.flatMap(tagConditions);
  return rule.conditionKind === "tag" && rule.tag ? [rule.tag] : [];
}

/** A tag nothing carries would count no course, so it is raised for review. */
export function unknownTagReviewItems(
  rule: AcademicStructureRequirementRule | null,
  knownTags: readonly string[],
): AcademicStructureExtractionReviewItem[] {
  const known = new Set(knownTags.map((tag) => tag.toLowerCase()));
  return [...new Set(tagConditions(rule))]
    .filter((tag) => !known.has(tag.toLowerCase()))
    .map((tag) => ({
      fieldKey: "requirements.rule",
      kind: "missing" as const,
      severity: "warning" as const,
      message: `No course list or course tag named ${tag} exists for this year, so no course counts toward it yet. Add the list under Course lists.`,
    }));
}
