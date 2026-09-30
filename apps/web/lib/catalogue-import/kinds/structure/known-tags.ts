import type { SyncSql } from "../../../catalogue-sync/sync-store.ts";
import type {
  AcademicStructureExtractionReviewItem,
  AcademicStructureRequirementRule,
} from "./contract.ts";

/**
 * Tags carried by published course versions. Tags named only by degree rules
 * are left out, since a rule naming a tag does not make any course count.
 */
export async function loadStructureTags(sql: SyncSql): Promise<string[]> {
  const rows = await sql`
    select min(tags.name) as name
    from public.course_tags as tags
    join public.catalogue_records as records
      on records.published_version_id = tags.version_id
    where records.archived_at is null
    group by lower(tags.name)
    order by lower(tags.name)
  `;
  return rows.map((row) => String(row.name));
}

/**
 * A tag no course carries, such as a college list the page does not print,
 * would count as zero and read as unmet. It becomes the page's wording with
 * its unit bounds, which students see as a requirement to check themselves,
 * and a review item records the change.
 */
export function uncountableTagsAsText(
  rule: AcademicStructureRequirementRule | null,
  knownTags: readonly string[],
): {
  rule: AcademicStructureRequirementRule | null;
  reviewItems: AcademicStructureExtractionReviewItem[];
} {
  const known = new Set(knownTags.map((tag) => tag.toLowerCase()));
  const converted = new Set<string>();
  const visit = (
    node: AcademicStructureRequirementRule,
  ): AcademicStructureRequirementRule => {
    if (node.type === "group")
      return { ...node, children: node.children.map(visit) };
    if (
      node.conditionKind !== "tag" ||
      !node.tag ||
      known.has(node.tag.toLowerCase())
    )
      return node;
    converted.add(node.tag);
    return {
      ...node,
      conditionKind: "free_text",
      tag: null,
      freeText: node.sourceText,
    };
  };
  return {
    rule: rule ? visit(rule) : null,
    reviewItems: [...converted].map((tag) => ({
      fieldKey: "requirements.rule",
      kind: "unsupported" as const,
      severity: "warning" as const,
      message: `No published course carries the tag ${tag}, so the rule is kept as wording that students check themselves.`,
    })),
  };
}
