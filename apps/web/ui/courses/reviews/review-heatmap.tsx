import { Hint } from "@/ui/common/hint";
import {
  type CourseSurveyResults,
  SURVEY_THEMES,
  agreementInterval,
  surveyLabel,
} from "@/lib/course-surveys/survey-results";

// Five stepped shades read faster than a continuous scale, where 64 and 68
// look identical anyway. Each band is the share of primary mixed into the card.
const AGREEMENT_BANDS = [
  { label: "<50", below: 50, share: 18 },
  { label: "50s", below: 60, share: 34 },
  { label: "60s", below: 70, share: 52 },
  { label: "70s", below: 80, share: 74 },
  { label: "80+", below: Infinity, share: 100 },
] as const;

function bandShade(percent: number) {
  const band = AGREEMENT_BANDS.find((entry) => percent < entry.below)!;
  return `color-mix(in oklab, var(--color-primary) ${band.share}%, var(--color-card))`;
}

/** Every theme in every surveyed semester, grouped by year. */
export function ReviewHeatmap({ results }: { results: CourseSurveyResults }) {
  const years = Array.from(
    results.surveys.reduce(
      (counts, survey) =>
        counts.set(survey.year, (counts.get(survey.year) ?? 0) + 1),
      new Map<number, number>(),
    ),
  );
  return (
    <figure className="space-y-4">
      <div className="relative overflow-x-auto pb-1">
        <table className="w-full min-w-[32rem] table-fixed border-separate border-spacing-[3px] text-xs">
          <caption className="sr-only">
            Percentage of respondents who agreed, by theme and semester
          </caption>
          <colgroup>
            <col className="w-20" />
          </colgroup>
          <thead>
            <tr>
              <td />
              {years.map(([year, count]) => (
                <th
                  key={year}
                  scope="colgroup"
                  colSpan={count}
                  className="pb-0.5 font-medium text-foreground/80"
                >
                  {year}
                </th>
              ))}
            </tr>
            <tr>
              <th scope="col" className="sr-only">
                Theme
              </th>
              {results.surveys.map((survey) => (
                <th
                  key={`${survey.year}-${survey.session}`}
                  scope="col"
                  className="pb-1 text-[11px] font-normal text-muted-foreground"
                >
                  <span className="sr-only">{surveyLabel(survey)}</span>
                  <span aria-hidden="true">
                    {survey.session === "sem_1" ? "S1" : "S2"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SURVEY_THEMES.map((theme) => (
              <tr key={theme.key}>
                <th
                  scope="row"
                  className="w-20 pr-2 text-left font-normal whitespace-nowrap text-foreground/80"
                >
                  {theme.shortLabel}
                </th>
                {results.surveys.map((survey) => {
                  const percent = survey.agreementPercent[theme.key];
                  const interval = agreementInterval(
                    percent,
                    survey.respondents,
                  );
                  return (
                    <td
                      key={`${survey.year}-${survey.session}`}
                      className="p-0"
                    >
                      <Hint
                        label={`${theme.shortLabel}, ${surveyLabel(survey)}: ${percent}% (approximate 90% interval ${interval.low} to ${interval.high}%)`}
                      >
                        <span
                          className="block h-7 rounded-[5px]"
                          style={{ backgroundColor: bandShade(percent) }}
                        >
                          <span className="sr-only">{percent}%</span>
                        </span>
                      </Hint>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="mr-1">Agreed</span>
        {AGREEMENT_BANDS.map((band) => (
          <span key={band.label} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="h-3 w-5 rounded-[3px]"
              style={{
                backgroundColor: `color-mix(in oklab, var(--color-primary) ${band.share}%, var(--color-card))`,
              }}
            />
            <span className="mr-1.5">{band.label}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
