"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import { SELT_METRICS } from "@/lib/selt/contract";

type Run = {
  id: string;
  expires_at: string;
  revoked_at: string | null;
  reports: number;
};
type Report = {
  id: string;
  code: string;
  course_name: string;
  periods: number;
  published_at: string | null;
  warnings: string[];
  notes: string[];
  source_url: string;
};
type Survey = {
  label: string;
  enrolments: number | null;
  respondents: number | null;
  response_rate_percent: number | null;
} & Record<(typeof SELT_METRICS)[number], number | null>;
export function SeltImports({ canPublish }: { canPublish: boolean }) {
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/admin/selt?page=${page}`, {
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setHasNext(result.hasNext ?? false);
    setRuns(result.runs);
    setReports(result.reports);
  }, [page]);
  useEffect(() => {
    setLoading(true);
    refresh()
      .catch(() => setError("SELT reports could not be loaded."))
      .finally(() => setLoading(false));
  }, [refresh]);
  async function action(action: string, id?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/selt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.token) setToken(result.token);
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The SELT action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function inspect(report: Report) {
    setSelected(report);
    setSurveys([]);
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/selt?reportId=${report.id}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSurveys(result.surveys);
    } catch {
      setError("Survey periods could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <h1 className="sr-only">SELT imports</h1>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => void action("create")}>
          Create local import token
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setError("");
            void refresh().catch(() =>
              setError("SELT reports could not be loaded."),
            );
          }}
        >
          Refresh
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {token && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">Local import token</h2>
          <p>
            Copy this token into the local script&#39;s hidden prompt. It
            expires after 12 hours and is shown only here.
          </p>
          <code className="block break-all select-all">{token}</code>
          <Button variant="outline" onClick={() => setToken(null)}>
            Hide token
          </Button>
        </section>
      )}
      {loading ? (
        <p role="status">Loading SELT imports...</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">Recent imports</h2>
            {runs.length === 0 && <p>No local imports yet.</p>}
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
              >
                <span>
                  {run.reports} reports ·{" "}
                  {run.revoked_at
                    ? "Revoked"
                    : new Date(run.expires_at).getTime() < Date.now()
                      ? "Expired"
                      : `Expires ${new Date(run.expires_at).toLocaleString()}`}
                </span>
                {!run.revoked_at && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void action("revoke", run.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Reports</h2>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={busy || loading || page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous page
              </Button>
              <span>Page {page}</span>
              <Button
                variant="outline"
                disabled={busy || loading || !hasNext}
                onClick={() => setPage(page + 1)}
              >
                Next page
              </Button>
            </div>
            {reports.length === 0 && <p>No extracted reports uploaded yet.</p>}
            {reports.map((report) => (
              <article
                key={report.id}
                className="space-y-2 rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <strong>{report.code}</strong>
                  <span>{report.course_name}</span>
                  <span>{report.periods} survey periods</span>
                  <span>{report.published_at ? "Published" : "Draft"}</span>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void inspect(report)}
                  >
                    Review
                  </Button>
                  {canPublish && !report.published_at && (
                    <Button
                      disabled={busy || report.warnings.length > 0}
                      onClick={() => void action("publish", report.id)}
                    >
                      Publish
                    </Button>
                  )}
                </div>
                {report.warnings.map((warning, index) => (
                  <p key={index} role="status">
                    {warning}
                  </p>
                ))}
              </article>
            ))}
          </section>
        </>
      )}
      {selected && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">{selected.code} survey results</h2>
          <a
            className="underline"
            href={selected.source_url}
            target="_blank"
            rel="noreferrer"
          >
            Original ANU report
          </a>
          {selected.notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Agreement percentages by survey period
              </caption>
              <thead>
                <tr>
                  {[
                    "Period",
                    "Enrolments",
                    "Respondents",
                    "Response rate (%)",
                    "Teaching (%)",
                    "Workload (%)",
                    "Feedback (%)",
                    "Analytical development (%)",
                    "Overall (%)",
                  ].map((label) => (
                    <th className="p-2" scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {surveys.map((survey) => (
                  <tr key={survey.label}>
                    {[
                      survey.label,
                      survey.enrolments,
                      survey.respondents,
                      survey.response_rate_percent,
                      ...SELT_METRICS.map((key) => survey[key]),
                    ].map((value, index) => (
                      <td className="p-2" key={index}>
                        {value ?? "Unavailable"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
