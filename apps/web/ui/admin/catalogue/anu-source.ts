import type { CatalogueKind } from "@/lib/coursemap/catalogue-kinds";

const PROGRAMS_AND_COURSES = "https://programsandcourses.anu.edu.au";

/**
 * The ANU Programs and Courses page used to sync a record. The site names
 * its own segments, so "programme" and "specialisation" cannot be used
 * verbatim. Kept here because the directory, the record header and the review
 * all need to point a reader back at the source they are judging.
 */
export function anuSourceUrl({
  kind,
  code,
  academicYear,
}: {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
}) {
  const segment =
    kind === "programme"
      ? "program"
      : kind === "specialisation"
        ? "specialisation"
        : kind;
  return `${PROGRAMS_AND_COURSES}/${academicYear}/${segment}/${code}`;
}

/** An element id the ANU page also uses as an anchor, so it can be linked to. */
const ANCHOR = /^#[A-Za-z][\w-]*$/;
/** Anything with selector punctuation names markup, not a place on the page. */
const SELECTOR = /[.#[\]=>,:]/;

export type SourceLocation = {
  /** Where on the ANU page the value was read, in the page's own words. */
  label: string | null;
  /** The page, deep-linked to that place where the locator allows it. */
  href: string;
};

/**
 * The pipeline records where it read a value as a CSS selector, which is how
 * the extractor found it rather than anything a reviewer can act on. An id
 * selector doubles as the page's own anchor, so it becomes a deep link and a
 * section name; a class or attribute selector names markup and is dropped
 * rather than printed at someone who is checking a value against the page.
 */
export function anuSourceLocation(
  sourceHref: string,
  locator: string | null,
): SourceLocation {
  const first = locator?.split(",")[0]?.trim();
  if (!first) return { label: null, href: sourceHref };
  if (ANCHOR.test(first))
    return {
      label: humaniseAnchor(first.slice(1)),
      href: `${sourceHref}${first}`,
    };
  if (SELECTOR.test(first)) return { label: null, href: sourceHref };
  return { label: first, href: sourceHref };
}

function humaniseAnchor(id: string) {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
