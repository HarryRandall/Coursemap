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
