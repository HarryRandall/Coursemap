import type { CatalogueKind } from "./content.ts";

const COURSE_CODE = /^[A-Z]{4}\d{4}[A-Z]?$/u;
const STRUCTURE_CODE = /^[A-Z0-9][A-Z0-9-]{1,31}$/u;
const ANU_RECORD_PATH =
  /^\/(?:\d{4}\/)?(course|program|major|minor|specialisation)\/([A-Za-z0-9-]+)\/?$/iu;
const ANU_HOST = "programsandcourses.anu.edu.au";

/** The catalogue kind an ANU code belongs to, read from its shape. */
export function catalogueKindForCode(code: string): CatalogueKind {
  if (COURSE_CODE.test(code)) return "course";
  if (code.endsWith("-MAJ")) return "major";
  if (code.endsWith("-MIN")) return "minor";
  if (/-(?:HSPC|SPEC)$/u.test(code)) return "specialisation";
  return "programme";
}

/**
 * The Coursemap record a link in imported text points at, if any. The model
 * writes a record either as its bare code, from the page's own links, or as
 * the full ANU address it copied; both open the record in Coursemap rather
 * than sending the reader back to ANU.
 */
export function catalogueRecordFromReference(
  target: string,
): { kind: CatalogueKind; code: string } | null {
  const trimmed = target.trim();
  // A link target already written as an upper-case code is a record; words
  // and addresses are not.
  if (STRUCTURE_CODE.test(trimmed)) {
    return { kind: catalogueKindForCode(trimmed), code: trimmed };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.hostname !== ANU_HOST) return null;
  const match = ANU_RECORD_PATH.exec(url.pathname);
  if (!match) return null;
  const code = match[2].toUpperCase();
  const kind =
    match[1].toLowerCase() === "program"
      ? "programme"
      : (match[1].toLowerCase() as CatalogueKind);
  return { kind, code };
}
