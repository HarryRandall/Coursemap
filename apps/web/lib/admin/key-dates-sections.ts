export type KeyDatesSection = "dates" | "sync" | "changelog";

export const KEY_DATES_SECTIONS: readonly KeyDatesSection[] = [
  "dates",
  "sync",
  "changelog",
];

/** The dates section is the year's own address; the others hang off it. */
export function keyDatesPath(year: number, section: KeyDatesSection) {
  return section === "dates"
    ? `/admin/key-dates/${year}`
    : `/admin/key-dates/${year}/${section}`;
}

/** The section a key dates path shows; anything unrecognised is the dates. */
export function keyDatesSectionFromPath(pathname: string): KeyDatesSection {
  const last = pathname.split("/").filter(Boolean).at(-1);
  return last === "sync" || last === "changelog" ? last : "dates";
}
