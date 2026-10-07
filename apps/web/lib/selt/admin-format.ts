export const SELT_ADMIN_PATH = "/admin/selt";

export type SeltReportStatus = "ready" | "blocked" | "published";

export const SELT_REPORT_STATUSES: readonly {
  value: SeltReportStatus;
  label: string;
}[] = [
  { value: "ready", label: "Ready to publish" },
  { value: "blocked", label: "Blocked" },
  { value: "published", label: "Published" },
];

export function seltReportStatusLabel(status: SeltReportStatus) {
  return SELT_REPORT_STATUSES.find((entry) => entry.value === status)!.label;
}

export function parseSeltReportStatus(value: string | null | undefined) {
  return SELT_REPORT_STATUSES.some((entry) => entry.value === value)
    ? (value as SeltReportStatus)
    : null;
}

export type SeltTokenState =
  | { kind: "active"; remainingMs: number }
  | { kind: "expired" }
  | { kind: "revoked" };

export function seltTokenState(
  token: { expiresAt: string; revokedAt: string | null },
  now: Date,
): SeltTokenState {
  if (token.revokedAt) return { kind: "revoked" };
  const remainingMs = Date.parse(token.expiresAt) - now.getTime();
  return remainingMs > 0
    ? { kind: "active", remainingMs }
    : { kind: "expired" };
}

/** "9 h left" or "25 min left", rounded down so it never overstates. */
export function remainingLabel(remainingMs: number) {
  const minutes = Math.floor(remainingMs / 60_000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} h left`
    : `${Math.max(1, minutes)} min left`;
}

/**
 * The masked handle shown for a token. Tokens are only ever shown once, so
 * the list identifies them by the end of the import run id instead.
 */
export function seltTokenHandle(runId: string) {
  return `selt_••••${runId.replace(/-/g, "").slice(-4)}`;
}

export type SeltSurveyRow = {
  label: string;
  enrolments: number | null;
  respondents: number | null;
  response_rate_percent: number | null;
};

export type SeltCheck = { label: string; passed: boolean };

/**
 * Consistency checks an administrator can verify against the PDF. The stated
 * response rate is rounded by ANU, so it may differ from the computed rate by
 * up to one point.
 */
export function seltReportChecks(
  surveys: readonly SeltSurveyRow[],
  warnings: readonly string[],
): SeltCheck[] {
  const counted = surveys.filter(
    (survey) => survey.enrolments !== null && survey.respondents !== null,
  );
  return [
    {
      label: "No extraction warnings",
      passed: warnings.length === 0,
    },
    {
      label: "Respondents never exceed enrolments",
      passed: counted.every(
        (survey) => survey.respondents! <= survey.enrolments!,
      ),
    },
    {
      label: "Response rates match the counts",
      passed: counted.every(
        (survey) =>
          survey.response_rate_percent === null ||
          survey.enrolments === 0 ||
          Math.abs(
            (survey.respondents! / survey.enrolments!) * 100 -
              survey.response_rate_percent,
          ) <= 1,
      ),
    },
    {
      label: "Each semester appears once",
      passed:
        new Set(surveys.map((survey) => survey.label)).size === surveys.length,
    },
  ];
}
