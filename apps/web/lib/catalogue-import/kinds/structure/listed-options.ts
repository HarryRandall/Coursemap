import type {
  AcademicStructureExtraction,
  AcademicStructureKind,
  AcademicStructureRelationship,
} from "./contract.ts";

type OptionKind = Exclude<AcademicStructureKind, "programme">;

/** The headings a programme page lists its majors, minors and specialisations under. */
const LIST_HEADINGS: Record<string, OptionKind> = {
  majors: "major",
  minors: "minor",
  specialisations: "specialisation",
  specializations: "specialisation",
};

const CODE_SUFFIX: Record<OptionKind, RegExp> = {
  major: /-MAJ$/u,
  minor: /-MIN$/u,
  specialisation: /-(?:HSPC|SPEC)$/u,
};

/** A link the page reader has turned into a record code, or a bare code. */
const LISTED_CODE =
  /\[([^\]]+)\]\(([A-Z0-9][A-Z0-9-]{1,31})\)|\b([A-Z0-9]{2,}-(?:MAJ|MIN|SPEC|HSPC))\b/gu;

/**
 * The majors, minors and specialisations a programme page lists under its own
 * Majors, Minors and Specialisations headings. The model has left these out
 * even when asked, and a student can only choose what is recorded as an
 * option, so the lists are read from the page as well.
 */
export function listedStructureOptions(
  pageMarkdown: string,
): Omit<AcademicStructureRelationship, "position">[] {
  const options: Omit<AcademicStructureRelationship, "position">[] = [];
  let listing: { kind: OptionKind; heading: string; level: number } | null =
    null;
  for (const line of pageMarkdown.split("\n")) {
    const heading = /^(#{1,4})\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (listing && level > listing.level) continue;
      const kind = LIST_HEADINGS[heading[2].toLowerCase()];
      listing = kind ? { kind, heading: heading[2], level } : null;
      continue;
    }
    if (!listing) continue;
    for (const match of line.matchAll(LISTED_CODE)) {
      const code = (match[2] ?? match[3]).toUpperCase();
      if (!CODE_SUFFIX[listing.kind].test(code)) continue;
      const title = match[1]?.trim() || null;
      options.push({
        relationshipKind: "option",
        targetKind: listing.kind,
        targetCode: code,
        targetTitle: title,
        sourceText: title ?? code,
        sourceLocator: listing.heading,
      });
    }
  }
  return options;
}

/** Adds the listed options the model did not record, after the ones it did. */
export function withListedStructureOptions(
  relationships: AcademicStructureExtraction["relationships"],
  pageMarkdown: string,
): AcademicStructureExtraction["relationships"] {
  const recorded = new Set(
    relationships
      .filter(({ relationshipKind }) => relationshipKind === "option")
      .map(({ targetKind, targetCode }) => `${targetKind}:${targetCode}`),
  );
  const last = Math.max(0, ...relationships.map(({ position }) => position));
  const added: AcademicStructureExtraction["relationships"] = [];
  for (const option of listedStructureOptions(pageMarkdown)) {
    const key = `${option.targetKind}:${option.targetCode}`;
    if (recorded.has(key)) continue;
    recorded.add(key);
    added.push({ ...option, position: last + added.length + 1 });
  }
  return added.length ? [...relationships, ...added] : relationships;
}
