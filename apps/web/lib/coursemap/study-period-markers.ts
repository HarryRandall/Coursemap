import type { Term } from "@/lib/coursemap/types";

/** Calendar boundaries replace continuous bars without inventing pending dates. */
export function studyPeriodMarkers(
  terms: Term[],
  courseCountByTerm: ReadonlyMap<string, number>,
) {
  return terms.flatMap((term) => {
    if (term.id === "unscheduled" || !term.startsOn || !term.endsOn) return [];
    const courses = courseCountByTerm.get(term.id) ?? 0;
    const suffix =
      courses > 0 ? ` · ${courses} course${courses === 1 ? "" : "s"}` : "";
    const boundaries =
      term.startsOn === term.endsOn
        ? [{ boundary: "starts and ends", date: term.startsOn }]
        : [
            { boundary: "starts", date: term.startsOn },
            { boundary: "ends", date: term.endsOn },
          ];
    return boundaries.map(({ boundary, date }) => ({
      id: `term-${term.id}-${boundary}`,
      title: `${term.name} ${term.year} ${boundary}${suffix}`,
      date,
    }));
  });
}
