export const SOCIETY_CATEGORIES = [
  "Academic",
  "Arts and performance",
  "Culture and community",
  "Hobbies and interests",
  "Advocacy",
] as const;

export type SocietyCategory = (typeof SOCIETY_CATEGORIES)[number];

export type Society = {
  slug: string;
  name: string;
  shortName: string;
  category: SocietyCategory;
  summary: string;
  overview: string;
  interests: string[];
  website?: string;
  logoUrl?: string;
  directoryUrl?: string;
  links?: { label: string; url: string }[];
};

export function filterSocieties(
  societies: Society[],
  query: string,
  category: string,
) {
  const terms = query
    .trim()
    .toLocaleLowerCase("en-AU")
    .split(/\s+/u)
    .filter(Boolean);
  return societies.filter((society) => {
    if (category && society.category !== category) return false;
    const text = [
      society.name,
      society.shortName,
      society.summary,
      society.category,
      ...society.interests,
    ]
      .join(" ")
      .toLocaleLowerCase("en-AU");
    return terms.every((term) => text.includes(term));
  });
}
